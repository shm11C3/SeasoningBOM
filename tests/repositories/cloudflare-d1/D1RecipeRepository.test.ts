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

  it("creates repositories with contribution events in one D1 batch", async () => {
    const result = await recipes.createWithContribution({
      contribution: {
        eventType: "recipe_created",
        id: "contribution_create",
        metadata: {
          repositoryName: "Curry Rice",
          repositoryOwnerHandle: "test-user",
          repositorySlug: "curry-rice",
          version: "0.1.0",
        },
        occurredAt: "2026-07-06T01:02:03.000Z",
        occurredOn: "2026-07-06",
        visibility: "summary_only",
      },
      id: "repo_test",
      name: "Curry Rice",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "curry-rice",
    });

    await expect(recipes.findByOwnerAndSlug("test-user", "curry-rice")).resolves.toEqual(
      result.repository,
    );
    expect(result.contributionEvent).toEqual({
      contributionCount: 1,
      eventType: "recipe_created",
      id: "contribution_create",
      metadata: {
        repositoryName: "Curry Rice",
        repositoryOwnerHandle: "test-user",
        repositorySlug: "curry-rice",
        version: "0.1.0",
      },
      occurredAt: "2026-07-06T01:02:03.000Z",
      occurredOn: "2026-07-06",
      repositoryId: "repo_test",
      userId: "profile_test",
      visibility: "summary_only",
    });
    expect(
      sqlite
        .prepare(
          `SELECT id, user_id, event_type, repository_id, occurred_on, occurred_at,
                  contribution_count, visibility, metadata_json
           FROM contribution_events`,
        )
        .get(),
    ).toEqual({
      contribution_count: 1,
      event_type: "recipe_created",
      id: "contribution_create",
      metadata_json: JSON.stringify({
        repositoryName: "Curry Rice",
        repositoryOwnerHandle: "test-user",
        repositorySlug: "curry-rice",
        version: "0.1.0",
      }),
      occurred_at: "2026-07-06T01:02:03.000Z",
      occurred_on: "2026-07-06",
      repository_id: "repo_test",
      user_id: "profile_test",
      visibility: "summary_only",
    });
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

  it("updates repositories with contribution events in one D1 batch", async () => {
    const created = await recipes.create({
      id: "repo_test",
      name: "Curry Rice",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "curry-rice",
    });

    const result = await recipes.updateWithContribution({
      ...created,
      contribution: {
        eventType: "recipe_updated",
        id: "contribution_update",
        metadata: {
          previousRepositorySlug: "curry-rice",
          repositoryName: "Updated Curry",
          repositoryOwnerHandle: "test-user",
          repositorySlug: "updated-curry",
          version: "1.0.0",
        },
        occurredAt: "2026-07-06T02:03:04.000Z",
        occurredOn: "2026-07-06",
        visibility: "summary_only",
      },
      name: "Updated Curry",
      now: "2026-07-06T02:03:04.000Z",
      slug: "updated-curry",
      version: "1.0.0",
    });

    await expect(recipes.findByOwnerAndSlug("test-user", "updated-curry")).resolves.toEqual(
      result.repository,
    );
    expect(result.contributionEvent).toEqual({
      contributionCount: 1,
      eventType: "recipe_updated",
      id: "contribution_update",
      metadata: {
        previousRepositorySlug: "curry-rice",
        repositoryName: "Updated Curry",
        repositoryOwnerHandle: "test-user",
        repositorySlug: "updated-curry",
        version: "1.0.0",
      },
      occurredAt: "2026-07-06T02:03:04.000Z",
      occurredOn: "2026-07-06",
      repositoryId: "repo_test",
      userId: "profile_test",
      visibility: "summary_only",
    });
    expect(
      sqlite
        .prepare(
          `SELECT event_type, repository_id, occurred_on, contribution_count, metadata_json
           FROM contribution_events`,
        )
        .get(),
    ).toEqual({
      contribution_count: 1,
      event_type: "recipe_updated",
      metadata_json: JSON.stringify({
        previousRepositorySlug: "curry-rice",
        repositoryName: "Updated Curry",
        repositoryOwnerHandle: "test-user",
        repositorySlug: "updated-curry",
        version: "1.0.0",
      }),
      occurred_on: "2026-07-06",
      repository_id: "repo_test",
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

  it("deletes related repository records before repository metadata", async () => {
    await recipes.create({
      id: "repo_test",
      name: "Curry Rice",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "curry-rice",
    });
    await recipes.create({
      id: "repo_fork",
      name: "Fork Curry",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "fork-curry",
      sourceRepositoryId: "repo_test",
    });
    sqlite
      .prepare(
        `INSERT INTO recipe_components (
           id, repository_id, ingredient_name, quantity, unit, dependency_type,
           required, allergens_json, alternatives_json, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "component_test",
        "repo_test",
        "curry roux",
        1,
        "box",
        "direct",
        1,
        "[]",
        "[]",
        "2026-07-06T02:03:04.000Z",
        "2026-07-06T02:03:04.000Z",
      );
    sqlite
      .prepare(
        `INSERT INTO ingredient_dependencies (
           id, component_id, dependency_name, dependency_type, allergens_json, notes
        )
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("dependency_test", "component_test", "wheat", "transitive", '["wheat"]', null);
    sqlite
      .prepare(
        `INSERT INTO repository_stars (user_id, repository_id, created_at)
         VALUES (?, ?, ?)`,
      )
      .run("profile_test", "repo_test", "2026-07-06T03:04:05.000Z");
    sqlite
      .prepare(
        `INSERT INTO cooking_logs (
           id, user_id, repository_id, recipe_version, result, notes, cooked_at, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "cook_test",
        "profile_test",
        "repo_test",
        "0.1.0",
        "cooked",
        null,
        "2026-07-06T04:05:06.000Z",
        "2026-07-06T05:06:07.000Z",
      );
    sqlite
      .prepare(
        `INSERT INTO contribution_events (
           id, user_id, event_type, repository_id, occurred_on, occurred_at,
           contribution_count, visibility, metadata_json
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "contribution_test",
        "profile_test",
        "cooking_logged",
        "repo_test",
        "2026-07-06",
        "2026-07-06T04:05:06.000Z",
        1,
        "summary_only",
        "{}",
      );

    await recipes.delete("repo_test");

    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM ingredient_dependencies").get()).toEqual({
      count: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM recipe_components").get()).toEqual({
      count: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM repository_stars").get()).toEqual({
      count: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM cooking_logs").get()).toEqual({
      count: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM contribution_events").get()).toEqual({
      count: 0,
    });
    await expect(recipes.findByOwnerAndSlug("test-user", "curry-rice")).resolves.toBeNull();
    await expect(recipes.findByOwnerAndSlug("test-user", "fork-curry")).resolves.toMatchObject({
      id: "repo_fork",
      sourceRepositoryId: undefined,
    });
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
