import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D1RecipeRepository } from "../../../src/repositories/cloudflare-d1/D1RecipeRepository";
import { D1RepositoryStarRepository } from "../../../src/repositories/cloudflare-d1/D1RepositoryStarRepository";
import { D1UserProfileRepository } from "../../../src/repositories/cloudflare-d1/D1UserProfileRepository";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1Value,
} from "../../../src/workers/api/types";

type SqliteValue = bigint | null | number | string;

const migrationSql = readFileSync(join(process.cwd(), "migrations/0001_cloud_mvp.sql"), "utf8");

describe("D1RepositoryStarRepository", () => {
  let recipes: D1RecipeRepository;
  let sqlite: DatabaseSync;
  let stars: D1RepositoryStarRepository;
  let users: D1UserProfileRepository;

  beforeEach(async () => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(migrationSql);
    const db = createSqliteD1(sqlite);
    recipes = new D1RecipeRepository(db);
    stars = new D1RepositoryStarRepository(db);
    users = new D1UserProfileRepository(db);

    await users.create({
      authProvider: "clerk",
      authSubject: "user_test",
      id: "profile_test",
      now: "2026-07-06T00:00:00.000Z",
      username: "test-user",
    });
    await recipes.create({
      id: "repo_test",
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

  it("stars and unstars repositories idempotently", async () => {
    await expect(
      stars.isStarred({ repositoryId: "repo_test", userId: "profile_test" }),
    ).resolves.toBe(false);

    await stars.star({
      now: "2026-07-06T02:03:04.000Z",
      repositoryId: "repo_test",
      userId: "profile_test",
    });
    await stars.star({
      now: "2026-07-06T03:04:05.000Z",
      repositoryId: "repo_test",
      userId: "profile_test",
    });

    await expect(
      stars.isStarred({ repositoryId: "repo_test", userId: "profile_test" }),
    ).resolves.toBe(true);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM repository_stars").get()).toEqual({
      count: 1,
    });

    await stars.unstar({ repositoryId: "repo_test", userId: "profile_test" });
    await stars.unstar({ repositoryId: "repo_test", userId: "profile_test" });

    await expect(
      stars.isStarred({ repositoryId: "repo_test", userId: "profile_test" }),
    ).resolves.toBe(false);
  });
});

function createSqliteD1(db: DatabaseSync): D1Database {
  return {
    batch: async () => {
      throw new Error("batch is not implemented in this test adapter");
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
      db.prepare(query).run(...sqliteValues);
      return { success: true } satisfies D1Result<T>;
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
