import { describe, expect, it } from "vitest";
import type { RecipeComponent } from "../../domain";
import type { D1Database, D1PreparedStatement, D1Result, D1Value } from "../../workers/api/types";
import { D1RecipeRepository } from "./D1RecipeRepository";

const component: RecipeComponent = {
  allergens: ["wheat"],
  alternatives: ["rice"],
  dependencyType: "required",
  id: "component_1",
  ingredientName: "roux",
  quantity: 1,
  recipeId: "repo_1",
  required: true,
  transitiveDependencies: [
    {
      allergens: ["milk"],
      dependencyType: "transitive",
      id: "dependency_1",
      name: "milk powder",
    },
  ],
  unit: "box",
};

describe("D1RecipeRepository dependency manifests", () => {
  it("creates repository metadata, contribution, and dependencies in one batch", async () => {
    const database = createCapturingDatabase();
    const repository = new D1RecipeRepository(database.db);

    await repository.createWithContribution({
      components: [component],
      contribution: { ...contribution, eventType: "recipe_created" },
      id: "repo_1",
      name: "Curry",
      now: "2026-07-23T00:00:00.000Z",
      ownerHandle: "test-cook",
      ownerUserId: "profile_1",
      slug: "curry",
    });

    expect(database.batches).toHaveLength(1);
    expect(database.batches[0]?.map((statement) => statement.query)).toEqual([
      expect.stringContaining("INSERT INTO recipe_repositories"),
      expect.stringContaining("INSERT INTO contribution_events"),
      expect.stringContaining("INSERT INTO recipe_components"),
      expect.stringContaining("INSERT INTO ingredient_dependencies"),
    ]);
  });

  it("updates repository metadata, contribution, and dependency replacement in one batch", async () => {
    const database = createCapturingDatabase();
    const repository = new D1RecipeRepository(database.db);

    await repository.updateWithContribution({
      components: [component],
      contribution,
      createdAt: "2026-07-22T00:00:00.000Z",
      id: "repo_1",
      name: "Curry",
      now: "2026-07-23T00:00:00.000Z",
      ownerHandle: "test-cook",
      ownerUserId: "profile_1",
      servings: 4,
      slug: "curry",
      version: "0.2.0",
      visibility: "public",
    });

    expect(database.batches).toHaveLength(1);
    expect(database.batches[0]?.map((statement) => statement.query)).toEqual([
      expect.stringContaining("UPDATE recipe_repositories"),
      expect.stringContaining("INSERT INTO contribution_events"),
      expect.stringContaining("DELETE FROM ingredient_dependencies"),
      expect.stringContaining("DELETE FROM recipe_components"),
      expect.stringContaining("INSERT INTO recipe_components"),
      expect.stringContaining("INSERT INTO ingredient_dependencies"),
    ]);
  });
});

const contribution = {
  eventType: "recipe_updated" as const,
  id: "contribution_1",
  metadata: {},
  occurredAt: "2026-07-23T00:00:00.000Z",
  occurredOn: "2026-07-23",
  visibility: "public" as const,
};

type CapturedStatement = D1PreparedStatement & {
  query: string;
  values: D1Value[];
};

function createCapturingDatabase(): {
  batches: CapturedStatement[][];
  db: D1Database;
} {
  const batches: CapturedStatement[][] = [];
  const db: D1Database = {
    async batch(statements) {
      batches.push(statements as CapturedStatement[]);
      return statements.map(() => ({ success: true }));
    },
    async exec() {
      return { success: true };
    },
    prepare(query) {
      const statement: CapturedStatement = {
        async all<T>() {
          return { results: [], success: true } as D1Result<T>;
        },
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async first<T>() {
          return null as T | null;
        },
        query,
        async raw<T>() {
          return [] as T[];
        },
        async run<T>() {
          return { success: true } as D1Result<T>;
        },
        values: [],
      };
      return statement;
    },
  };

  return { batches, db };
}
