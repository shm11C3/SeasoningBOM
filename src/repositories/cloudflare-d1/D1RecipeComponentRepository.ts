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
  id: string;
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
  createComponent(
    repositoryId: string,
    component: RecipeComponent,
    now: string,
  ): Promise<RecipeComponent>;
  createDependency(
    repositoryId: string,
    componentId: string,
    dependency: IngredientDependency,
  ): Promise<IngredientDependency | null>;
  deleteComponent(repositoryId: string, componentId: string): Promise<boolean>;
  deleteDependency(
    repositoryId: string,
    componentId: string,
    dependencyId: string,
  ): Promise<boolean>;
  findByRepositoryIdAndComponentId(
    repositoryId: string,
    componentId: string,
  ): Promise<RecipeComponent | null>;
  replaceByRepositoryId(
    repositoryId: string,
    components: RecipeComponent[],
    now: string,
  ): Promise<RecipeComponent[]>;
  updateComponent(
    repositoryId: string,
    component: RecipeComponent,
    now: string,
  ): Promise<RecipeComponent | null>;
  updateDependency(
    repositoryId: string,
    componentId: string,
    dependency: IngredientDependency,
  ): Promise<IngredientDependency | null>;
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
  ingredient_dependencies.id,
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

  async findByRepositoryIdAndComponentId(
    repositoryId: string,
    componentId: string,
  ): Promise<RecipeComponent | null> {
    const components = await this.listByRepositoryId(repositoryId);
    return components.find((component) => component.id === componentId) ?? null;
  }

  async createComponent(
    repositoryId: string,
    component: RecipeComponent,
    now: string,
  ): Promise<RecipeComponent> {
    await this.db.batch([
      buildInsertComponentStatement(this.db, repositoryId, component, now),
      ...component.transitiveDependencies.map((dependency, index) =>
        buildInsertDependencyStatement(this.db, component.id, dependency, index),
      ),
    ]);

    const created = await this.findByRepositoryIdAndComponentId(repositoryId, component.id);
    if (!created) {
      throw new Error("Created component could not be loaded.");
    }
    return created;
  }

  async updateComponent(
    repositoryId: string,
    component: RecipeComponent,
    now: string,
  ): Promise<RecipeComponent | null> {
    const current = await this.findByRepositoryIdAndComponentId(repositoryId, component.id);
    if (!current) {
      return null;
    }

    await this.db.batch([
      this.db
        .prepare(
          `UPDATE recipe_components
           SET ingredient_name = ?,
               quantity = ?,
               unit = ?,
               dependency_type = ?,
               required = ?,
               allergens_json = ?,
               alternatives_json = ?,
               updated_at = ?
           WHERE repository_id = ? AND id = ?`,
        )
        .bind(
          component.ingredientName,
          component.quantity,
          component.unit,
          component.dependencyType,
          component.required,
          JSON.stringify(component.allergens),
          JSON.stringify(component.alternatives),
          now,
          repositoryId,
          component.id,
        ),
      this.db
        .prepare("DELETE FROM ingredient_dependencies WHERE component_id = ?")
        .bind(component.id),
      ...component.transitiveDependencies.map((dependency, index) =>
        buildInsertDependencyStatement(this.db, component.id, dependency, index),
      ),
    ]);

    return this.findByRepositoryIdAndComponentId(repositoryId, component.id);
  }

  async deleteComponent(repositoryId: string, componentId: string): Promise<boolean> {
    const current = await this.findByRepositoryIdAndComponentId(repositoryId, componentId);
    if (!current) {
      return false;
    }

    await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM ingredient_dependencies
           WHERE component_id IN (
             SELECT id FROM recipe_components WHERE repository_id = ? AND id = ?
           )`,
        )
        .bind(repositoryId, componentId),
      this.db
        .prepare("DELETE FROM recipe_components WHERE repository_id = ? AND id = ?")
        .bind(repositoryId, componentId),
    ]);

    return true;
  }

  async createDependency(
    repositoryId: string,
    componentId: string,
    dependency: IngredientDependency,
  ): Promise<IngredientDependency | null> {
    const component = await this.findByRepositoryIdAndComponentId(repositoryId, componentId);
    if (!component) {
      return null;
    }

    await buildInsertDependencyStatement(this.db, componentId, dependency, 0).run();
    return this.findDependencyById(
      repositoryId,
      componentId,
      requiredDependencyId(componentId, dependency, 0),
    );
  }

  async updateDependency(
    repositoryId: string,
    componentId: string,
    dependency: IngredientDependency,
  ): Promise<IngredientDependency | null> {
    const dependencyId = requiredDependencyId(componentId, dependency, 0);
    const result = await this.db
      .prepare(
        `UPDATE ingredient_dependencies
         SET dependency_name = ?,
             dependency_type = ?,
             allergens_json = ?,
             notes = ?
         WHERE id = ?
           AND component_id IN (
             SELECT id FROM recipe_components WHERE repository_id = ? AND id = ?
           )`,
      )
      .bind(
        dependency.name,
        dependency.dependencyType,
        JSON.stringify(dependency.allergens),
        dependency.notes ?? null,
        dependencyId,
        repositoryId,
        componentId,
      )
      .run();
    if (result.meta?.changes === 0) {
      return null;
    }

    return this.findDependencyById(repositoryId, componentId, dependencyId);
  }

  async deleteDependency(
    repositoryId: string,
    componentId: string,
    dependencyId: string,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `DELETE FROM ingredient_dependencies
         WHERE id = ?
           AND component_id IN (
             SELECT id FROM recipe_components WHERE repository_id = ? AND id = ?
           )`,
      )
      .bind(dependencyId, repositoryId, componentId)
      .run();

    return (result.meta?.changes ?? 0) > 0;
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
        statements.push(buildInsertDependencyStatement(this.db, component.id, dependency, index));
      });
    }

    await this.db.batch(statements);
    return this.listByRepositoryId(repositoryId);
  }

  private async findDependencyById(
    repositoryId: string,
    componentId: string,
    dependencyId: string,
  ): Promise<IngredientDependency | null> {
    const row = await this.db
      .prepare(`${dependencySelect}
         WHERE recipe_components.repository_id = ?
           AND recipe_components.id = ?
           AND ingredient_dependencies.id = ?`)
      .bind(repositoryId, componentId, dependencyId)
      .first<IngredientDependencyRow>();

    return row ? mapIngredientDependencyRow(row) : null;
  }
}

function groupDependenciesByComponentId(
  rows: IngredientDependencyRow[],
): Map<string, IngredientDependency[]> {
  const dependenciesByComponentId = new Map<string, IngredientDependency[]>();
  for (const row of rows) {
    const dependency = mapIngredientDependencyRow(row);
    const dependencies = dependenciesByComponentId.get(row.component_id) ?? [];
    dependencies.push(dependency);
    dependenciesByComponentId.set(row.component_id, dependencies);
  }

  return dependenciesByComponentId;
}

function buildInsertComponentStatement(
  db: D1Database,
  repositoryId: string,
  component: RecipeComponent,
  now: string,
) {
  return db
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
    );
}

function buildInsertDependencyStatement(
  db: D1Database,
  componentId: string,
  dependency: IngredientDependency,
  index: number,
) {
  return db
    .prepare(insertDependencySql)
    .bind(
      requiredDependencyId(componentId, dependency, index),
      componentId,
      dependency.name,
      dependency.dependencyType,
      JSON.stringify(dependency.allergens),
      dependency.notes ?? null,
    );
}

function requiredDependencyId(
  componentId: string,
  dependency: IngredientDependency,
  index: number,
): string {
  return dependency.id ?? `${componentId}:dependency:${index}`;
}

function mapIngredientDependencyRow(row: IngredientDependencyRow): IngredientDependency {
  return {
    allergens: parseStringArray(row.allergens_json) as Allergen[],
    dependencyType: row.dependency_type,
    id: row.id,
    name: row.dependency_name,
    notes: row.notes ?? undefined,
  };
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
