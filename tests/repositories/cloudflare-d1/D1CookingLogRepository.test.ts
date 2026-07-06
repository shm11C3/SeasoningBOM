import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D1CookingLogRepository } from "../../../src/repositories/cloudflare-d1/D1CookingLogRepository";
import { D1RecipeRepository } from "../../../src/repositories/cloudflare-d1/D1RecipeRepository";
import { D1UserProfileRepository } from "../../../src/repositories/cloudflare-d1/D1UserProfileRepository";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1Value,
} from "../../../src/workers/api/types";

type SqliteValue = bigint | null | number | string;

const migrationSql = readFileSync(join(process.cwd(), "migrations/0001_cloud_mvp.sql"), "utf8");

describe("D1CookingLogRepository", () => {
  let cookingLogs: D1CookingLogRepository;
  let recipes: D1RecipeRepository;
  let sqlite: DatabaseSync;
  let users: D1UserProfileRepository;

  beforeEach(async () => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(migrationSql);
    const db = createSqliteD1(sqlite);
    cookingLogs = new D1CookingLogRepository(db);
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

function createSqliteD1(db: DatabaseSync): D1Database {
  return {
    batch: async <T = unknown>(statements: D1PreparedStatement[]) => {
      db.exec("BEGIN TRANSACTION");
      try {
        const results: D1Result<T>[] = [];
        for (const statement of statements) {
          results.push(await statement.run<T>());
        }
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    exec: async (query) => {
      db.exec(query);
      return { success: true };
    },
    prepare: (query) => createStatement(db, query),
  };
}

function createStatement(
  db: DatabaseSync,
  query: string,
  values: D1Value[] = [],
): D1PreparedStatement {
  const sqliteValues = values.map(toSqliteValue);

  return {
    all: async <T = unknown>() => {
      const results = db.prepare(query).all(...sqliteValues) as T[];
      return { results, success: true } satisfies D1Result<T>;
    },
    bind: (...nextValues) => createStatement(db, query, nextValues),
    first: async <T = unknown>() =>
      (db.prepare(query).get(...sqliteValues) as T | undefined) ?? null,
    raw: async <_T = unknown>() => {
      throw new Error("raw is not implemented in this test adapter");
    },
    run: async <T = unknown>() => {
      const result = db.prepare(query).run(...sqliteValues) as { changes?: bigint | number };
      return {
        meta: { changes: Number(result.changes ?? 0) },
        success: true,
      } satisfies D1Result<T>;
    },
  };
}

function toSqliteValue(value: D1Value): SqliteValue {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (value instanceof ArrayBuffer) {
    throw new Error("ArrayBuffer values are not implemented in this test adapter");
  }

  return value;
}
