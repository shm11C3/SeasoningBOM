import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D1RecipeRepository } from "../../../src/repositories/cloudflare-d1/D1RecipeRepository";
import { D1UserProfileRepository } from "../../../src/repositories/cloudflare-d1/D1UserProfileRepository";
import { createSqliteD1 } from "./sqliteD1";

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
