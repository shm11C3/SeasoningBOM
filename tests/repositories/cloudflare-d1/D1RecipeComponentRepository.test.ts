import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D1RecipeComponentRepository } from "../../../src/repositories/cloudflare-d1/D1RecipeComponentRepository";
import { D1RecipeRepository } from "../../../src/repositories/cloudflare-d1/D1RecipeRepository";
import { D1UserProfileRepository } from "../../../src/repositories/cloudflare-d1/D1UserProfileRepository";
import { createSqliteD1 } from "./sqliteD1";

const migrationSql = readFileSync(join(process.cwd(), "migrations/0001_cloud_mvp.sql"), "utf8");

describe("D1RecipeComponentRepository", () => {
  let components: D1RecipeComponentRepository;
  let recipes: D1RecipeRepository;
  let sqlite: DatabaseSync;
  let users: D1UserProfileRepository;

  beforeEach(async () => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(migrationSql);
    const db = createSqliteD1(sqlite);
    components = new D1RecipeComponentRepository(db);
    recipes = new D1RecipeRepository(db);
    users = new D1UserProfileRepository(db);

    await users.create({
      authProvider: "clerk",
      authSubject: "user_test",
      id: "profile_test",
      now: "2026-07-06T00:00:00.000Z",
      username: "test-user",
    });
    await recipes.create({
      id: "repo_curry",
      name: "Curry Rice",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "curry-rice",
    });
    await recipes.create({
      id: "repo_other",
      name: "Other Curry",
      now: "2026-07-06T01:02:03.000Z",
      ownerHandle: "test-user",
      ownerUserId: "profile_test",
      slug: "other-curry",
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("lists components and ingredient dependencies scoped to a repository", async () => {
    insertComponent(sqlite, {
      allergensJson: '["wheat"]',
      alternativesJson: '["homemade roux"]',
      id: "component_roux",
      ingredientName: "curry-roux",
      repositoryId: "repo_curry",
    });
    insertDependency(sqlite, {
      allergensJson: '["milk"]',
      componentId: "component_roux",
      dependencyName: "milk powder",
      id: "dependency_milk",
      notes: "Often hidden in roux blocks.",
    });
    insertDependency(sqlite, {
      allergensJson: '["soy"]',
      componentId: "component_roux",
      dependencyName: "soy lecithin",
      id: "dependency_soy",
    });
    insertComponent(sqlite, {
      id: "component_other",
      ingredientName: "salt",
      repositoryId: "repo_other",
    });

    await expect(components.listByRepositoryId("repo_curry")).resolves.toEqual([
      {
        allergens: ["wheat"],
        alternatives: ["homemade roux"],
        dependencyType: "required",
        id: "component_roux",
        ingredientName: "curry-roux",
        quantity: 1,
        recipeId: "repo_curry",
        required: true,
        transitiveDependencies: [
          {
            allergens: ["milk"],
            dependencyType: "transitive",
            name: "milk powder",
            notes: "Often hidden in roux blocks.",
          },
          {
            allergens: ["soy"],
            dependencyType: "transitive",
            name: "soy lecithin",
            notes: undefined,
          },
        ],
        unit: "box",
      },
    ]);
  });

  it("ignores malformed component metadata arrays", async () => {
    insertComponent(sqlite, {
      allergensJson: "not-json",
      alternativesJson: '["salt", 42]',
      id: "component_salt",
      ingredientName: "salt",
      repositoryId: "repo_curry",
    });
    insertDependency(sqlite, {
      allergensJson: '{"not":"an array"}',
      componentId: "component_salt",
      dependencyName: "soy sauce",
      id: "dependency_soy",
    });

    await expect(components.listByRepositoryId("repo_curry")).resolves.toEqual([
      expect.objectContaining({
        allergens: [],
        alternatives: ["salt"],
        id: "component_salt",
        transitiveDependencies: [
          expect.objectContaining({
            allergens: [],
            name: "soy sauce",
          }),
        ],
      }),
    ]);
  });

  it("returns optional components without transitive dependencies", async () => {
    insertComponent(sqlite, {
      id: "component_parsley",
      ingredientName: "parsley",
      repositoryId: "repo_curry",
      required: 0,
    });

    await expect(components.listByRepositoryId("repo_curry")).resolves.toEqual([
      expect.objectContaining({
        id: "component_parsley",
        required: false,
        transitiveDependencies: [],
      }),
    ]);
  });

  it("replaces components and removes stale ingredient dependencies", async () => {
    insertComponent(sqlite, {
      id: "component_old",
      ingredientName: "old roux",
      repositoryId: "repo_curry",
    });
    insertDependency(sqlite, {
      componentId: "component_old",
      dependencyName: "old milk",
      id: "dependency_old",
    });

    await expect(
      components.replaceByRepositoryId(
        "repo_curry",
        [
          {
            allergens: ["wheat"],
            alternatives: ["homemade roux"],
            dependencyType: "required",
            id: "component_new",
            ingredientName: "new roux",
            quantity: 2,
            recipeId: "repo_curry",
            required: true,
            transitiveDependencies: [
              {
                allergens: ["milk"],
                dependencyType: "transitive",
                name: "milk powder",
                notes: "Often hidden.",
              },
            ],
            unit: "box",
          },
        ],
        "2026-07-06T03:04:05.000Z",
      ),
    ).resolves.toEqual([
      {
        allergens: ["wheat"],
        alternatives: ["homemade roux"],
        dependencyType: "required",
        id: "component_new",
        ingredientName: "new roux",
        quantity: 2,
        recipeId: "repo_curry",
        required: true,
        transitiveDependencies: [
          {
            allergens: ["milk"],
            dependencyType: "transitive",
            name: "milk powder",
            notes: "Often hidden.",
          },
        ],
        unit: "box",
      },
    ]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM ingredient_dependencies").get()).toEqual({
      count: 1,
    });
  });

  it("clears all components for a repository", async () => {
    insertComponent(sqlite, {
      id: "component_old",
      ingredientName: "old roux",
      repositoryId: "repo_curry",
    });
    insertDependency(sqlite, {
      componentId: "component_old",
      dependencyName: "old milk",
      id: "dependency_old",
    });

    await expect(
      components.replaceByRepositoryId("repo_curry", [], "2026-07-06T03:04:05.000Z"),
    ).resolves.toEqual([]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM recipe_components").get()).toEqual({
      count: 0,
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM ingredient_dependencies").get()).toEqual({
      count: 0,
    });
  });
});

function insertComponent(
  db: DatabaseSync,
  input: {
    allergensJson?: string;
    alternativesJson?: string;
    id: string;
    ingredientName: string;
    repositoryId: string;
    required?: number;
  },
): void {
  db.prepare(
    `INSERT INTO recipe_components (
       id, repository_id, ingredient_name, quantity, unit, dependency_type,
       required, allergens_json, alternatives_json, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.repositoryId,
    input.ingredientName,
    1,
    "box",
    "required",
    input.required ?? 1,
    input.allergensJson ?? "[]",
    input.alternativesJson ?? "[]",
    "2026-07-06T02:03:04.000Z",
    "2026-07-06T02:03:04.000Z",
  );
}

function insertDependency(
  db: DatabaseSync,
  input: {
    allergensJson?: string;
    componentId: string;
    dependencyName: string;
    id: string;
    notes?: string;
  },
): void {
  db.prepare(
    `INSERT INTO ingredient_dependencies (
       id, component_id, dependency_name, dependency_type, allergens_json, notes
     )
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.componentId,
    input.dependencyName,
    "transitive",
    input.allergensJson ?? "[]",
    input.notes ?? null,
  );
}
