import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D1ContributionRepository } from "../../../src/repositories/cloudflare-d1/D1ContributionRepository";
import { D1RecipeRepository } from "../../../src/repositories/cloudflare-d1/D1RecipeRepository";
import { D1UserProfileRepository } from "../../../src/repositories/cloudflare-d1/D1UserProfileRepository";
import { createSqliteD1 } from "./sqliteD1";

const migrationSql = readFileSync(join(process.cwd(), "migrations/0001_cloud_mvp.sql"), "utf8");

describe("D1ContributionRepository", () => {
  let contributions: D1ContributionRepository;
  let recipes: D1RecipeRepository;
  let sqlite: DatabaseSync;
  let users: D1UserProfileRepository;

  beforeEach(async () => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(migrationSql);
    const db = createSqliteD1(sqlite);
    contributions = new D1ContributionRepository(db);
    recipes = new D1RecipeRepository(db);
    users = new D1UserProfileRepository(db);

    await users.create({
      authProvider: "clerk",
      authSubject: "user_test",
      contributionVisibility: "summary_only",
      id: "profile_test",
      now: "2026-07-06T00:00:00.000Z",
      username: "test-user",
    });
    await users.create({
      authProvider: "clerk",
      authSubject: "user_other",
      contributionVisibility: "public",
      id: "profile_other",
      now: "2026-07-06T00:00:00.000Z",
      username: "other-user",
    });
    await recipes.create({
      id: "repo_curry",
      name: "Curry Rice",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "curry-rice",
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("lists contribution counts grouped by date and scoped to the user", async () => {
    insertContribution(sqlite, {
      contributionCount: 1,
      id: "contribution_cook",
      occurredOn: "2026-07-06",
      userId: "profile_test",
    });
    insertContribution(sqlite, {
      contributionCount: 2,
      id: "contribution_eol",
      occurredOn: "2026-07-06",
      userId: "profile_test",
    });
    insertContribution(sqlite, {
      contributionCount: 1,
      id: "contribution_next",
      occurredOn: "2026-07-07",
      userId: "profile_test",
    });
    insertContribution(sqlite, {
      contributionCount: 9,
      id: "contribution_other",
      occurredOn: "2026-07-06",
      userId: "profile_other",
    });

    await expect(
      contributions.listCountsByDate({
        from: "2026-07-06",
        to: "2026-07-07",
        userId: "profile_test",
      }),
    ).resolves.toEqual([
      { contributionCount: 3, occurredOn: "2026-07-06" },
      { contributionCount: 1, occurredOn: "2026-07-07" },
    ]);
  });

  it("returns empty contribution reads when no rows match", async () => {
    await expect(
      contributions.listCountsByDate({
        from: "2026-07-06",
        to: "2026-07-07",
        userId: "profile_test",
      }),
    ).resolves.toEqual([]);
    await expect(
      contributions.listEventsForDate({
        occurredOn: "2026-07-06",
        publicOnly: false,
        userId: "profile_test",
      }),
    ).resolves.toEqual([]);
  });

  it("lists contribution events for a date and can filter to public details", async () => {
    insertContribution(sqlite, {
      id: "contribution_summary",
      metadataJson: '{"result":"cooked"}',
      occurredAt: "2026-07-06T04:05:06.000Z",
      occurredOn: "2026-07-06",
      userId: "profile_test",
      visibility: "summary_only",
    });
    insertContribution(sqlite, {
      id: "contribution_public",
      metadataJson: '{"repositoryName":"Curry Rice"}',
      occurredAt: "2026-07-06T05:05:06.000Z",
      occurredOn: "2026-07-06",
      userId: "profile_test",
      visibility: "public",
    });
    insertContribution(sqlite, {
      id: "contribution_other_day",
      occurredOn: "2026-07-07",
      userId: "profile_test",
      visibility: "public",
    });

    await expect(
      contributions.listEventsForDate({
        occurredOn: "2026-07-06",
        publicOnly: true,
        userId: "profile_test",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "contribution_public",
        metadata: { repositoryName: "Curry Rice" },
        visibility: "public",
      }),
    ]);
    await expect(
      contributions.listEventsForDate({
        occurredOn: "2026-07-06",
        publicOnly: false,
        userId: "profile_test",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: "contribution_public" }),
      expect.objectContaining({ id: "contribution_summary" }),
    ]);
  });

  it("treats malformed contribution metadata as an empty object", async () => {
    insertContribution(sqlite, {
      id: "contribution_bad_metadata",
      metadataJson: "not-json",
      occurredOn: "2026-07-06",
      userId: "profile_test",
    });

    await expect(
      contributions.listEventsForDate({
        occurredOn: "2026-07-06",
        publicOnly: false,
        userId: "profile_test",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "contribution_bad_metadata",
        metadata: {},
      }),
    ]);
  });

  it("treats non-object contribution metadata as an empty object", async () => {
    insertContribution(sqlite, {
      id: "contribution_array_metadata",
      metadataJson: '["not","an","object"]',
      occurredOn: "2026-07-06",
      userId: "profile_test",
    });

    await expect(
      contributions.listEventsForDate({
        occurredOn: "2026-07-06",
        publicOnly: false,
        userId: "profile_test",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "contribution_array_metadata",
        metadata: {},
      }),
    ]);
  });
});

function insertContribution(
  db: DatabaseSync,
  input: {
    contributionCount?: number;
    id: string;
    metadataJson?: string;
    occurredAt?: string;
    occurredOn: string;
    userId: string;
    visibility?: string;
  },
): void {
  db.prepare(
    `INSERT INTO contribution_events (
       id, user_id, event_type, repository_id, occurred_on, occurred_at,
       contribution_count, visibility, metadata_json
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.userId,
    "cooking_logged",
    "repo_curry",
    input.occurredOn,
    input.occurredAt ?? `${input.occurredOn}T00:00:00.000Z`,
    input.contributionCount ?? 1,
    input.visibility ?? "summary_only",
    input.metadataJson ?? "{}",
  );
}
