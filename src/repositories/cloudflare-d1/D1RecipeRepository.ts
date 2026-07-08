import type { RecipeRepositoryEntity } from "../../domain";
import type { D1Database } from "../../workers/api/types";

export type CloudRecipeRepository = RecipeRepositoryEntity & {
  ownerUserId: string;
  sourceRepositoryId?: string;
};

export type CreateRecipeRepositoryInput = {
  id: string;
  ownerUserId: string;
  ownerHandle: string;
  name: string;
  slug: string;
  description?: string;
  visibility?: RecipeRepositoryEntity["visibility"];
  version?: string;
  servings?: number;
  readme?: string;
  license?: string;
  sourceRepositoryId?: string;
  now: string;
};

export type UpdateRecipeRepositoryInput = {
  id: string;
  ownerUserId: string;
  ownerHandle: string;
  name: string;
  slug: string;
  description?: string;
  visibility: RecipeRepositoryEntity["visibility"];
  version: string;
  servings: number;
  readme?: string;
  license?: string;
  sourceRepositoryId?: string;
  createdAt: string;
  now: string;
};

type RecipeRepositoryRow = {
  id: string;
  owner_user_id: string;
  owner_handle: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: RecipeRepositoryEntity["visibility"];
  version: string;
  servings: number;
  readme: string | null;
  license: string | null;
  source_repository_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeRepositoryMetadataRepository = {
  create(input: CreateRecipeRepositoryInput): Promise<CloudRecipeRepository>;
  delete(id: string): Promise<void>;
  findByOwnerAndSlug(ownerHandle: string, slug: string): Promise<CloudRecipeRepository | null>;
  listPublic(): Promise<CloudRecipeRepository[]>;
  update(input: UpdateRecipeRepositoryInput): Promise<CloudRecipeRepository>;
};

const repositorySelect = `SELECT
  recipe_repositories.id,
  recipe_repositories.owner_user_id,
  user_profiles.username AS owner_handle,
  recipe_repositories.name,
  recipe_repositories.slug,
  recipe_repositories.description,
  recipe_repositories.visibility,
  recipe_repositories.version,
  recipe_repositories.servings,
  recipe_repositories.readme,
  recipe_repositories.license,
  recipe_repositories.source_repository_id,
  recipe_repositories.created_at,
  recipe_repositories.updated_at
FROM recipe_repositories
INNER JOIN user_profiles ON user_profiles.id = recipe_repositories.owner_user_id`;

export class D1RecipeRepository implements RecipeRepositoryMetadataRepository {
  constructor(private readonly db: D1Database) {}

  async listPublic(): Promise<CloudRecipeRepository[]> {
    const result = await this.db
      .prepare(`${repositorySelect}
         WHERE recipe_repositories.visibility = ?
         ORDER BY recipe_repositories.updated_at DESC, recipe_repositories.name ASC`)
      .bind("public")
      .all<RecipeRepositoryRow>();

    return (result.results ?? []).map(mapRecipeRepositoryRow);
  }

  async findByOwnerAndSlug(
    ownerHandle: string,
    slug: string,
  ): Promise<CloudRecipeRepository | null> {
    const row = await this.db
      .prepare(`${repositorySelect}
         WHERE user_profiles.username = ? AND recipe_repositories.slug = ?`)
      .bind(ownerHandle, slug)
      .first<RecipeRepositoryRow>();

    return row ? mapRecipeRepositoryRow(row) : null;
  }

  async create(input: CreateRecipeRepositoryInput): Promise<CloudRecipeRepository> {
    const visibility = input.visibility ?? "public";
    const version = input.version ?? "0.1.0";
    const servings = input.servings ?? 2;

    await this.db
      .prepare(
        `INSERT INTO recipe_repositories (
           id, owner_user_id, name, slug, description, visibility, version,
           servings, readme, license, source_repository_id, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.ownerUserId,
        input.name,
        input.slug,
        input.description ?? null,
        visibility,
        version,
        servings,
        input.readme ?? null,
        input.license ?? null,
        input.sourceRepositoryId ?? null,
        input.now,
        input.now,
      )
      .run();

    return {
      id: input.id,
      ownerUserId: input.ownerUserId,
      ownerHandle: input.ownerHandle,
      name: input.name,
      slug: input.slug,
      description: input.description,
      visibility,
      version,
      servings,
      tags: [],
      license: input.license,
      maintainer: input.ownerHandle,
      readme: input.readme,
      sourceRepositoryId: input.sourceRepositoryId,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  async update(input: UpdateRecipeRepositoryInput): Promise<CloudRecipeRepository> {
    await this.db
      .prepare(
        `UPDATE recipe_repositories
         SET name = ?,
             slug = ?,
             description = ?,
             visibility = ?,
             version = ?,
             servings = ?,
             readme = ?,
             license = ?,
             source_repository_id = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.name,
        input.slug,
        input.description ?? null,
        input.visibility,
        input.version,
        input.servings,
        input.readme ?? null,
        input.license ?? null,
        input.sourceRepositoryId ?? null,
        input.now,
        input.id,
      )
      .run();

    return {
      id: input.id,
      ownerUserId: input.ownerUserId,
      ownerHandle: input.ownerHandle,
      name: input.name,
      slug: input.slug,
      description: input.description,
      visibility: input.visibility,
      version: input.version,
      servings: input.servings,
      tags: [],
      license: input.license,
      maintainer: input.ownerHandle,
      readme: input.readme,
      sourceRepositoryId: input.sourceRepositoryId,
      createdAt: input.createdAt,
      updatedAt: input.now,
    };
  }

  async delete(id: string): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM ingredient_dependencies
           WHERE component_id IN (
             SELECT id FROM recipe_components WHERE repository_id = ?
           )`,
        )
        .bind(id),
      this.db.prepare("DELETE FROM recipe_components WHERE repository_id = ?").bind(id),
      this.db.prepare("DELETE FROM repository_stars WHERE repository_id = ?").bind(id),
      this.db.prepare("DELETE FROM contribution_events WHERE repository_id = ?").bind(id),
      this.db.prepare("DELETE FROM cooking_logs WHERE repository_id = ?").bind(id),
      this.db
        .prepare(
          "UPDATE recipe_repositories SET source_repository_id = NULL WHERE source_repository_id = ?",
        )
        .bind(id),
      this.db.prepare("DELETE FROM recipe_repositories WHERE id = ?").bind(id),
    ]);
  }
}

export function mapRecipeRepositoryRow(row: RecipeRepositoryRow): CloudRecipeRepository {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerHandle: row.owner_handle,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    visibility: row.visibility,
    version: row.version,
    servings: row.servings,
    tags: [],
    license: row.license ?? undefined,
    maintainer: row.owner_handle,
    readme: row.readme ?? undefined,
    sourceRepositoryId: row.source_repository_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
