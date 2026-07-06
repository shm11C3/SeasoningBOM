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

export type RecipeComponentWriteRepository = RecipeComponentReadRepository & {
  replaceByRepositoryId(
    repositoryId: string,
    components: RecipeComponent[],
    now: string,
  ): Promise<RecipeComponent[]>;
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

const insertComponentSql = `INSERT INTO recipe_components (
  id,
  repository_id,
  ingredient_name,
  quantity,
  unit,
  dependency_type,
  required,
  allergens_json,
  alternatives_json,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const insertDependencySql = `INSERT INTO ingredient_dependencies (
  id,
  component_id,
  dependency_name,
  dependency_type,
  allergens_json,
  notes
) VALUES (?, ?, ?, ?, ?, ?)`;

export class D1RecipeComponentRepository implements RecipeComponentWriteRepository {
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

  async replaceByRepositoryId(
    repositoryId: string,
    components: RecipeComponent[],
    now: string,
  ): Promise<RecipeComponent[]> {
    const statements = [
      this.db
        .prepare(`DELETE FROM ingredient_dependencies
          WHERE component_id IN (
            SELECT id FROM recipe_components WHERE repository_id = ?
          )`)
        .bind(repositoryId),
      this.db.prepare("DELETE FROM recipe_components WHERE repository_id = ?").bind(repositoryId),
    ];

    for (const component of components) {
      statements.push(
        this.db
          .prepare(insertComponentSql)
          .bind(
            component.id,
            repositoryId,
            component.ingredientName,
            component.quantity,
            component.unit,
            component.dependencyType,
            component.required,
            JSON.stringify(component.allergens),
            JSON.stringify(component.alternatives),
            now,
            now,
          ),
      );

      component.transitiveDependencies.forEach((dependency, index) => {
        statements.push(
          this.db
            .prepare(insertDependencySql)
            .bind(
              `${component.id}:dependency:${index}`,
              component.id,
              dependency.name,
              dependency.dependencyType,
              JSON.stringify(dependency.allergens),
              dependency.notes ?? null,
            ),
        );
      });
    }

    await this.db.batch(statements);
    return this.listByRepositoryId(repositoryId);
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
