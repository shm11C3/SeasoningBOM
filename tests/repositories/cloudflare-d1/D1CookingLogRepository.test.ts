import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D1CookingLogRepository } from "../../../src/repositories/cloudflare-d1/D1CookingLogRepository";
import { D1InventoryRepository } from "../../../src/repositories/cloudflare-d1/D1InventoryRepository";
import { D1RecipeRepository } from "../../../src/repositories/cloudflare-d1/D1RecipeRepository";
import { D1UserProfileRepository } from "../../../src/repositories/cloudflare-d1/D1UserProfileRepository";
import { createSqliteD1 } from "./sqliteD1";

const migrationSql = readFileSync(join(process.cwd(), "migrations/0001_cloud_mvp.sql"), "utf8");

describe("D1CookingLogRepository", () => {
  let cookingLogs: D1CookingLogRepository;
  let inventory: D1InventoryRepository;
  let recipes: D1RecipeRepository;
  let sqlite: DatabaseSync;
  let users: D1UserProfileRepository;

  beforeEach(async () => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(migrationSql);
    const db = createSqliteD1(sqlite);
    cookingLogs = new D1CookingLogRepository(db);
    inventory = new D1InventoryRepository(db);
    recipes = new D1RecipeRepository(db);
    users = new D1UserProfileRepository(db);

    await users.create({
      authProvider: "clerk",
      authSubject: "user_owner",
      contributionVisibility: "summary_only",
      displayName: "Owner User",
      id: "profile_owner",
      now: "2026-07-06T00:00:00.000Z",
      username: "owner",
    });
    await users.create({
      authProvider: "clerk",
      authSubject: "user_public",
      contributionVisibility: "public",
      displayName: "Public Cook",
      id: "profile_public",
      now: "2026-07-06T00:00:00.000Z",
      username: "public-cook",
    });

    await recipes.create({
      id: "repo_curry",
      name: "Curry Rice",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "owner",
      ownerUserId: "profile_owner",
      slug: "curry-rice",
      version: "1.2.3",
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("creates a cooking log and matching contribution event in one batch", async () => {
    const result = await cookingLogs.createWithContribution({
      authorDisplayName: "Owner User",
      authorHandle: "owner",
      contributionEventId: "contribution_cook",
      contributionVisibility: "summary_only",
      cookedAt: "2026-07-06T04:05:06.000Z",
      cookingLogId: "cook_owner",
      notes: "Stable deploy to table.",
      now: "2026-07-06T05:06:07.000Z",
      occurredOn: "2026-07-06",
      recipeVersion: "1.2.3",
      repositoryId: "repo_curry",
      repositoryName: "Curry Rice",
      repositoryOwnerHandle: "owner",
      repositorySlug: "curry-rice",
      result: "cooked",
      userId: "profile_owner",
    });

    expect(result.cookingLog).toMatchObject({
      id: "cook_owner",
      notes: "Stable deploy to table.",
      recipeVersion: "1.2.3",
      repositoryId: "repo_curry",
    });
    expect(result.contributionEvent).toMatchObject({
      contributionCount: 1,
      eventType: "cooking_logged",
      id: "contribution_cook",
      occurredOn: "2026-07-06",
      visibility: "summary_only",
    });

    const contributionRow = sqlite
      .prepare(
        `SELECT event_type, contribution_count, visibility, metadata_json
         FROM contribution_events
         WHERE id = ?`,
      )
      .get("contribution_cook") as {
      contribution_count: number;
      event_type: string;
      metadata_json: string;
      visibility: string;
    };
    expect(contributionRow).toMatchObject({
      contribution_count: 1,
      event_type: "cooking_logged",
      visibility: "summary_only",
    });
    expect(JSON.parse(contributionRow.metadata_json)).toMatchObject({
      cookingLogId: "cook_owner",
      repositorySlug: "curry-rice",
      result: "cooked",
    });
  });

  it("links used inventory and records a private EOL rescue contribution in one batch", async () => {
    await inventory.create({
      bestBeforeDate: "2026-07-07",
      category: "dairy",
      id: "inventory_milk",
      name: "milk",
      now: "2026-07-06T01:02:03.000Z",
      quantity: 1,
      unit: "l",
      userId: "profile_owner",
    });

    const result = await cookingLogs.createWithContribution({
      authorDisplayName: "Owner User",
      authorHandle: "owner",
      contributionEventId: "contribution_cook",
      contributionVisibility: "summary_only",
      cookedAt: "2026-07-06T04:05:06.000Z",
      cookingLogId: "cook_owner",
      eolRescueContribution: {
        id: "contribution_rescue",
        rescuedItems: [
          {
            bestBeforeDate: "2026-07-07",
            id: "inventory_milk",
            name: "milk",
            quantity: 1,
            unit: "l",
          },
        ],
      },
      now: "2026-07-06T05:06:07.000Z",
      occurredOn: "2026-07-06",
      recipeVersion: "1.2.3",
      repositoryId: "repo_curry",
      repositoryName: "Curry Rice",
      repositoryOwnerHandle: "owner",
      repositorySlug: "curry-rice",
      result: "cooked",
      usedInventoryItemIds: ["inventory_milk"],
      userId: "profile_owner",
    });

    expect(result.eolRescueContributionEvent).toMatchObject({
      contributionCount: 2,
      eventType: "eol_rescued",
      id: "contribution_rescue",
      occurredOn: "2026-07-06",
      visibility: "private",
    });

    const linkedInventoryRows = sqlite
      .prepare(
        `SELECT cooking_log_id, inventory_item_id
         FROM cooking_log_inventory_items
         WHERE cooking_log_id = ?`,
      )
      .all("cook_owner") as Array<{ cooking_log_id: string; inventory_item_id: string }>;
    expect(linkedInventoryRows).toEqual([
      {
        cooking_log_id: "cook_owner",
        inventory_item_id: "inventory_milk",
      },
    ]);

    const contributionRows = sqlite
      .prepare(
        `SELECT event_type, contribution_count, visibility, metadata_json
         FROM contribution_events
         ORDER BY event_type ASC`,
      )
      .all() as Array<{
      contribution_count: number;
      event_type: string;
      metadata_json: string;
      visibility: string;
    }>;
    expect(contributionRows).toEqual([
      expect.objectContaining({
        contribution_count: 1,
        event_type: "cooking_logged",
        visibility: "summary_only",
      }),
      expect.objectContaining({
        contribution_count: 2,
        event_type: "eol_rescued",
        visibility: "private",
      }),
    ]);
    expect(JSON.parse(contributionRows[1].metadata_json)).toMatchObject({
      cookingLogId: "cook_owner",
      rescuedItems: [
        {
          bestBeforeDate: "2026-07-07",
          id: "inventory_milk",
          name: "milk",
        },
      ],
      repositorySlug: "curry-rice",
    });
  });

  it("lists public logs for everyone and summary-only logs only for the author", async () => {
    await cookingLogs.createWithContribution({
      authorDisplayName: "Owner User",
      authorHandle: "owner",
      contributionEventId: "contribution_owner",
      contributionVisibility: "summary_only",
      cookedAt: "2026-07-06T04:05:06.000Z",
      cookingLogId: "cook_owner",
      now: "2026-07-06T05:06:07.000Z",
      occurredOn: "2026-07-06",
      recipeVersion: "1.2.3",
      repositoryId: "repo_curry",
      repositoryName: "Curry Rice",
      repositoryOwnerHandle: "owner",
      repositorySlug: "curry-rice",
      result: "cooked",
      userId: "profile_owner",
    });
    await cookingLogs.createWithContribution({
      authorDisplayName: "Public Cook",
      authorHandle: "public-cook",
      contributionEventId: "contribution_public",
      contributionVisibility: "public",
      cookedAt: "2026-07-07T04:05:06.000Z",
      cookingLogId: "cook_public",
      now: "2026-07-07T05:06:07.000Z",
      occurredOn: "2026-07-07",
      recipeVersion: "1.2.3",
      repositoryId: "repo_curry",
      repositoryName: "Curry Rice",
      repositoryOwnerHandle: "owner",
      repositorySlug: "curry-rice",
      result: "cooked",
      userId: "profile_public",
    });

    await expect(
      cookingLogs.listVisibleForRepository({ repositoryId: "repo_curry" }),
    ).resolves.toEqual([
      expect.objectContaining({
        authorHandle: "public-cook",
        id: "cook_public",
      }),
    ]);
    await expect(
      cookingLogs.listVisibleForRepository({
        repositoryId: "repo_curry",
        viewerUserId: "profile_owner",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        authorHandle: "public-cook",
        id: "cook_public",
      }),
      expect.objectContaining({
        authorHandle: "owner",
        id: "cook_owner",
      }),
    ]);
  });
});
