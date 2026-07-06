import type {
  Allergen,
  DependencyType,
  IngredientDependency,
  IngredientDependencyType,
  RecipeComponent,
  Unit,
} from "../../domain";
import type { D1Database } from "../../workers/api/types";

type RecipeComponentRow = {
  id: string;
  repository_id: string;
  ingredient_name: string;
  quantity: number;
  unit: Unit;
  dependency_type: DependencyType;
  required: number;
  allergens_json: string;
  alternatives_json: string;
};

type IngredientDependencyRow = {
  component_id: string;
  dependency_name: string;
  dependency_type: IngredientDependencyType;
  allergens_json: string;
  notes: string | null;
};

export type RecipeComponentReadRepository = {
  listByRepositoryId(repositoryId: string): Promise<RecipeComponent[]>;
};

const componentSelect = `SELECT
  id,
  repository_id,
  ingredient_name,
  quantity,
  unit,
  dependency_type,
  required,
  allergens_json,
  alternatives_json
FROM recipe_components`;

const dependencySelect = `SELECT
  ingredient_dependencies.component_id,
  ingredient_dependencies.dependency_name,
  ingredient_dependencies.dependency_type,
  ingredient_dependencies.allergens_json,
  ingredient_dependencies.notes
FROM ingredient_dependencies
INNER JOIN recipe_components ON recipe_components.id = ingredient_dependencies.component_id`;

export class D1RecipeComponentRepository implements RecipeComponentReadRepository {
  constructor(private readonly db: D1Database) {}

  async listByRepositoryId(repositoryId: string): Promise<RecipeComponent[]> {
    const [componentsResult, dependenciesResult] = await Promise.all([
      this.db
        .prepare(`${componentSelect}
           WHERE repository_id = ?
           ORDER BY ingredient_name COLLATE NOCASE ASC, id ASC`)
        .bind(repositoryId)
        .all<RecipeComponentRow>(),
      this.db
        .prepare(`${dependencySelect}
           WHERE recipe_components.repository_id = ?
           ORDER BY ingredient_dependencies.dependency_name COLLATE NOCASE ASC,
                    ingredient_dependencies.component_id ASC`)
        .bind(repositoryId)
        .all<IngredientDependencyRow>(),
    ]);

    const dependenciesByComponentId = groupDependenciesByComponentId(
      dependenciesResult.results ?? [],
    );

    return (componentsResult.results ?? []).map((row) =>
      mapRecipeComponentRow(row, dependenciesByComponentId.get(row.id) ?? []),
    );
  }
}

function groupDependenciesByComponentId(
  rows: IngredientDependencyRow[],
): Map<string, IngredientDependency[]> {
  const dependenciesByComponentId = new Map<string, IngredientDependency[]>();
  for (const row of rows) {
    const dependency: IngredientDependency = {
      allergens: parseStringArray(row.allergens_json) as Allergen[],
      dependencyType: row.dependency_type,
      name: row.dependency_name,
      notes: row.notes ?? undefined,
    };
    const dependencies = dependenciesByComponentId.get(row.component_id) ?? [];
    dependencies.push(dependency);
    dependenciesByComponentId.set(row.component_id, dependencies);
  }

  return dependenciesByComponentId;
}

function mapRecipeComponentRow(
  row: RecipeComponentRow,
  transitiveDependencies: IngredientDependency[],
): RecipeComponent {
  return {
    allergens: parseStringArray(row.allergens_json) as Allergen[],
    alternatives: parseStringArray(row.alternatives_json),
    dependencyType: row.dependency_type,
    id: row.id,
    ingredientName: row.ingredient_name,
    quantity: row.quantity,
    recipeId: row.repository_id,
    required: row.required !== 0,
    transitiveDependencies,
    unit: row.unit,
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
