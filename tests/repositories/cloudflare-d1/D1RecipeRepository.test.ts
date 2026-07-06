import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

describe("D1RecipeRepository", () => {
  let sqlite: DatabaseSync;
  let recipes: D1RecipeRepository;
  let users: D1UserProfileRepository;

  beforeEach(async () => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(migrationSql);
    const db = createSqliteD1(sqlite);
    recipes = new D1RecipeRepository(db);
    users = new D1UserProfileRepository(db);

    await users.create({
      authProvider: "clerk",
      authSubject: "user_test",
      id: "profile_test",
      now: "2026-07-06T00:00:00.000Z",
      username: "test-user",
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("creates and finds repositories by owner handle and slug", async () => {
    const created = await recipes.create({
      description: "A reliable curry recipe.",
      id: "repo_test",
      license: "Mother's Taste License",
      name: "Curry Rice",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      readme: "# Curry Rice",
      servings: 4,
      slug: "curry-rice",
      version: "1.2.3",
      visibility: "unlisted",
    });

    await expect(recipes.findByOwnerAndSlug("test-user", "curry-rice")).resolves.toEqual(created);
    await expect(recipes.findByOwnerAndSlug("test-user", "missing")).resolves.toBeNull();
  });

  it("lists public repositories only", async () => {
    await recipes.create({
      id: "repo_public",
      name: "Public Curry",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "public-curry",
      visibility: "public",
    });
    await recipes.create({
      id: "repo_unlisted",
      name: "Unlisted Curry",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "unlisted-curry",
      visibility: "unlisted",
    });
    await recipes.create({
      id: "repo_private",
      name: "Private Curry",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "private-curry",
      visibility: "private",
    });

    await expect(recipes.listPublic()).resolves.toEqual([
      expect.objectContaining({
        id: "repo_public",
        slug: "public-curry",
        visibility: "public",
      }),
    ]);
  });

  it("updates repository metadata", async () => {
    const created = await recipes.create({
      id: "repo_test",
      name: "Curry Rice",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "curry-rice",
    });

    const updated = await recipes.update({
      ...created,
      name: "Updated Curry",
      slug: "updated-curry",
      visibility: "private",
      now: "2026-07-06T02:03:04.000Z",
    });

    await expect(recipes.findByOwnerAndSlug("test-user", "curry-rice")).resolves.toBeNull();
    await expect(recipes.findByOwnerAndSlug("test-user", "updated-curry")).resolves.toEqual(
      updated,
    );
    expect(updated).toMatchObject({
      name: "Updated Curry",
      updatedAt: "2026-07-06T02:03:04.000Z",
      visibility: "private",
    });
  });

  it("persists source repository references for forks", async () => {
    const source = await recipes.create({
      id: "repo_source",
      name: "Original Curry",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "original-curry",
    });

    await recipes.create({
      id: "repo_fork",
      name: "Original Curry",
      now: "2026-07-06T02:03:04.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "forked-curry",
      sourceRepositoryId: source.id,
    });

    await expect(recipes.findByOwnerAndSlug("test-user", "forked-curry")).resolves.toEqual(
      expect.objectContaining({
        id: "repo_fork",
        sourceRepositoryId: "repo_source",
      }),
    );
  });

  it("deletes repository metadata", async () => {
    await recipes.create({
      id: "repo_test",
      name: "Curry Rice",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "curry-rice",
    });

    await recipes.delete("repo_test");

    await expect(recipes.findByOwnerAndSlug("test-user", "curry-rice")).resolves.toBeNull();
  });

  it("enforces owner scoped slug uniqueness", async () => {
    await recipes.create({
      id: "repo_first",
      name: "Curry Rice",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "curry-rice",
    });

    await expect(
      recipes.create({
        id: "repo_duplicate",
        name: "Duplicate Curry",
        now: "2026-07-06T01:02:03.000Z",
        ownerHandle: "test-user",
        ownerUserId: "profile_test",
        slug: "curry-rice",
      }),
    ).rejects.toThrow();
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
