import {
  type Allergen,
  allergens,
  type DependencyType,
  dependencyTypes,
  type IngredientDependency,
  type IngredientDependencyType,
  type RecipeComponent,
  type RecipeRepositoryEntity,
  repositoryVisibilities,
  type Unit,
  units,
} from "../../domain";
import {
  D1RecipeComponentRepository,
  type RecipeComponentWriteRepository,
} from "../../repositories/cloudflare-d1/D1RecipeComponentRepository";
import {
  type CloudRecipeRepository,
  D1RecipeRepository,
  type RecipeRepositoryMetadataRepository,
} from "../../repositories/cloudflare-d1/D1RecipeRepository";
import type { UserProfile } from "../../repositories/cloudflare-d1/D1UserProfileRepository";
import { authenticateClerkRequest, type ClerkAuthenticationOptions } from "../auth/clerk";
import { type ProfileRouteOptions, requireBootstrappedProfile } from "./profile";
import { badRequest, conflict, jsonResponse, repositoryNotFound, serverError } from "./responses";
import type { WorkerEnv } from "./types";

export type RepositoryRouteOptions = ClerkAuthenticationOptions &
  ProfileRouteOptions & {
    createRecipeComponentId?: () => string;
    createRepositoryId?: () => string;
    now?: () => Date;
    recipeComponents?: RecipeComponentWriteRepository;
    recipeRepositories?: RecipeRepositoryMetadataRepository;
  };

type RepositoryResponseBody = {
  repository: SerializedRepository;
};

type RepositoryListResponseBody = {
  repositories: SerializedRepository[];
};

type RepositoryDependenciesResponseBody = {
  repository: SerializedRepository;
  components: SerializedRecipeComponent[];
};

type SerializedRepository = {
  id: string;
  ownerHandle: string;
  name: string;
  slug: string;
  description?: string;
  visibility: RecipeRepositoryEntity["visibility"];
  version: string;
  servings: number;
  tags: string[];
  license?: string;
  maintainer?: string;
  readme?: string;
  sourceRepositoryId?: string;
  createdAt: string;
  updatedAt: string;
};

type SerializedRecipeComponent = {
  id: string;
  ingredientName: string;
  quantity: number;
  unit: Unit;
  dependencyType: DependencyType;
  required: boolean;
  allergens: Allergen[];
  alternatives: string[];
  transitiveDependencies: SerializedIngredientDependency[];
};

type SerializedIngredientDependency = {
  name: string;
  dependencyType: IngredientDependencyType;
  allergens: Allergen[];
  notes?: string;
};

type ReplaceRepositoryDependenciesBody = {
  components?: unknown;
};

type CreateRepositoryBody = {
  description?: unknown;
  license?: unknown;
  name?: unknown;
  readme?: unknown;
  servings?: unknown;
  slug?: unknown;
  visibility?: unknown;
  version?: unknown;
};

type UpdateRepositoryBody = CreateRepositoryBody;

const repositorySlugPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const allergenSet = new Set<string>(allergens);
const dependencyTypeSet = new Set<string>(dependencyTypes);
const ingredientDependencyTypes = ["transitive", "substitute", "peer"] as const;
const ingredientDependencyTypeSet = new Set<string>(ingredientDependencyTypes);
const maxDependencyReplacementRows = 38;
const repositoryVisibilitySet = new Set<string>(repositoryVisibilities);
const unitSet = new Set<string>(units);
const updateRepositoryFields = [
  "description",
  "license",
  "name",
  "readme",
  "servings",
  "slug",
  "visibility",
  "version",
];

export async function handleListRepositories(
  env: WorkerEnv,
  options: RepositoryRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);

  try {
    const publicRepositories = await repositories.listPublic();
    return jsonResponse({
      repositories: publicRepositories.map(serializeRepository),
    } satisfies RepositoryListResponseBody);
  } catch {
    return serverError("Failed to load repositories.");
  }
}

export async function handleGetRepository(
  request: Request,
  ownerHandle: string,
  slug: string,
  env: WorkerEnv,
  options: RepositoryRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);
  const repositoryResult = await findReadableRepository(
    request,
    repositories,
    ownerHandle,
    slug,
    env,
    options,
    "Failed to load repository.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  return jsonResponse(serializeRepositoryResponse(repositoryResult.repository));
}

export async function handleGetRepositoryDependencies(
  request: Request,
  ownerHandle: string,
  slug: string,
  env: WorkerEnv,
  options: RepositoryRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);
  const components = getRecipeComponentRepository(env, options);
  const repositoryResult = await findReadableRepository(
    request,
    repositories,
    ownerHandle,
    slug,
    env,
    options,
    "Failed to load dependencies.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  try {
    const recipeComponents = await components.listByRepositoryId(repositoryResult.repository.id);
    return jsonResponse({
      components: recipeComponents.map(serializeRecipeComponent),
      repository: serializeRepository(repositoryResult.repository),
    } satisfies RepositoryDependenciesResponseBody);
  } catch {
    return serverError("Failed to load dependencies.");
  }
}

export async function handlePutRepositoryDependencies(
  request: Request,
  ownerHandle: string,
  slug: string,
  owner: UserProfile,
  env: WorkerEnv,
  options: RepositoryRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);
  const components = getRecipeComponentRepository(env, options);
  const repositoryResult = await findOwnedRepository(
    repositories,
    ownerHandle,
    slug,
    owner,
    "Failed to update dependencies.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  const body = await readRepositoryDependenciesBody(request);
  if (!body.ok) {
    return badRequest(body.message);
  }

  const input = normalizeReplaceRepositoryDependenciesBody(
    body.value,
    repositoryResult.repository.id,
    options,
  );
  if (!input.ok) {
    return badRequest(input.message);
  }

  const now = (options.now?.() ?? new Date()).toISOString();

  try {
    const recipeComponents = await components.replaceByRepositoryId(
      repositoryResult.repository.id,
      input.value.components,
      now,
    );

    return jsonResponse({
      components: recipeComponents.map(serializeRecipeComponent),
      repository: serializeRepository(repositoryResult.repository),
    } satisfies RepositoryDependenciesResponseBody);
  } catch {
    return serverError("Failed to update dependencies.");
  }
}

async function findReadableRepository(
  request: Request,
  repositories: RecipeRepositoryMetadataRepository,
  ownerHandle: string,
  slug: string,
  env: WorkerEnv,
  options: RepositoryRouteOptions,
  failureMessage: string,
): Promise<{ ok: true; repository: CloudRecipeRepository } | { ok: false; response: Response }> {
  let repository: CloudRecipeRepository | null;
  try {
    repository = await repositories.findByOwnerAndSlug(ownerHandle, slug);
  } catch {
    return { ok: false, response: serverError(failureMessage) };
  }

  if (!repository) {
    return { ok: false, response: repositoryNotFound() };
  }

  if (repository.visibility === "public" || repository.visibility === "unlisted") {
    return { ok: true, repository };
  }

  const viewer = await resolveOptionalProfile(request, env, options);
  if (viewer.kind === "error") {
    return { ok: false, response: viewer.response };
  }

  if (viewer.profile?.id !== repository.ownerUserId) {
    return { ok: false, response: repositoryNotFound() };
  }

  return { ok: true, repository };
}

export async function handlePostRepository(
  request: Request,
  owner: UserProfile,
  env: WorkerEnv,
  options: RepositoryRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);
  const body = await readRepositoryBody(request);
  if (!body.ok) {
    return badRequest(body.message);
  }

  const input = normalizeCreateRepositoryBody(body.value);
  if (!input.ok) {
    return badRequest(input.message);
  }

  let existingRepository: CloudRecipeRepository | null;
  try {
    existingRepository = await repositories.findByOwnerAndSlug(owner.username, input.value.slug);
  } catch {
    return serverError("Failed to create repository.");
  }
  if (existingRepository) {
    return conflict(
      "repository_already_exists",
      "A repository with this owner and slug already exists.",
    );
  }

  const now = (options.now?.() ?? new Date()).toISOString();
  const id = options.createRepositoryId?.() ?? crypto.randomUUID();

  try {
    const repository = await repositories.create({
      ...input.value,
      id,
      ownerHandle: owner.username,
      ownerUserId: owner.id,
      now,
    });

    return jsonResponse(serializeRepositoryResponse(repository), { status: 201 });
  } catch {
    try {
      const repositoryAfterCreate = await repositories.findByOwnerAndSlug(
        owner.username,
        input.value.slug,
      );
      if (repositoryAfterCreate) {
        return conflict(
          "repository_already_exists",
          "A repository with this owner and slug already exists.",
        );
      }
    } catch {
      return serverError("Failed to create repository.");
    }

    return serverError("Failed to create repository.");
  }
}

export async function handlePatchRepository(
  request: Request,
  ownerHandle: string,
  slug: string,
  owner: UserProfile,
  env: WorkerEnv,
  options: RepositoryRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);
  const currentResult = await findOwnedRepository(
    repositories,
    ownerHandle,
    slug,
    owner,
    "Failed to update repository.",
  );
  if (!currentResult.ok) {
    return currentResult.response;
  }

  const body = await readRepositoryBody(request);
  if (!body.ok) {
    return badRequest(body.message);
  }

  const input = normalizeUpdateRepositoryBody(body.value, currentResult.repository);
  if (!input.ok) {
    return badRequest(input.message);
  }

  if (input.value.slug !== currentResult.repository.slug) {
    let slugOwner: CloudRecipeRepository | null;
    try {
      slugOwner = await repositories.findByOwnerAndSlug(owner.username, input.value.slug);
    } catch {
      return serverError("Failed to update repository.");
    }

    if (slugOwner && slugOwner.id !== currentResult.repository.id) {
      return conflict(
        "repository_already_exists",
        "A repository with this owner and slug already exists.",
      );
    }
  }

  const now = (options.now?.() ?? new Date()).toISOString();

  try {
    const repository = await repositories.update({
      ...input.value,
      id: currentResult.repository.id,
      ownerHandle: currentResult.repository.ownerHandle,
      ownerUserId: currentResult.repository.ownerUserId,
      sourceRepositoryId: currentResult.repository.sourceRepositoryId,
      createdAt: currentResult.repository.createdAt,
      now,
    });

    return jsonResponse(serializeRepositoryResponse(repository));
  } catch {
    try {
      const slugOwner = await repositories.findByOwnerAndSlug(owner.username, input.value.slug);
      if (slugOwner && slugOwner.id !== currentResult.repository.id) {
        return conflict(
          "repository_already_exists",
          "A repository with this owner and slug already exists.",
        );
      }
    } catch {
      return serverError("Failed to update repository.");
    }

    return serverError("Failed to update repository.");
  }
}

export async function handleDeleteRepository(
  ownerHandle: string,
  slug: string,
  owner: UserProfile,
  env: WorkerEnv,
  options: RepositoryRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);
  const currentResult = await findOwnedRepository(
    repositories,
    ownerHandle,
    slug,
    owner,
    "Failed to delete repository.",
  );
  if (!currentResult.ok) {
    return currentResult.response;
  }

  try {
    await repositories.delete(currentResult.repository.id);
    return new Response(null, { status: 204 });
  } catch {
    return serverError("Failed to delete repository.");
  }
}

function normalizeCreateRepositoryBody(body: CreateRepositoryBody):
  | {
      ok: true;
      value: {
        name: string;
        slug: string;
        description?: string;
        visibility: RecipeRepositoryEntity["visibility"];
        version: string;
        servings: number;
        readme?: string;
        license?: string;
      };
    }
  | { message: string; ok: false } {
  const name = normalizeRequiredText(body.name, 120);
  if (!name) {
    return { message: "Name must be a non-empty string up to 120 characters.", ok: false };
  }

  const slug = normalizeRepositorySlug(body.slug);
  if (!slug) {
    return { message: "Slug must be 1-80 lowercase letters, numbers, or hyphens.", ok: false };
  }

  const visibility = normalizeVisibility(body.visibility);
  if (!visibility) {
    return { message: "Visibility must be public, private, or unlisted.", ok: false };
  }

  const normalizedVersion = normalizeOptionalText(body.version, 32);
  if (normalizedVersion === false) {
    return { message: "Version must be 32 characters or fewer.", ok: false };
  }
  const version = normalizedVersion || "0.1.0";

  const servings = normalizeServings(body.servings);
  if (!servings) {
    return { message: "Servings must be an integer between 1 and 999.", ok: false };
  }

  const description = normalizeOptionalText(body.description, 280);
  if (description === false) {
    return { message: "Description must be 280 characters or fewer.", ok: false };
  }

  const readme = normalizeOptionalText(body.readme, 20_000);
  if (readme === false) {
    return { message: "README must be 20000 characters or fewer.", ok: false };
  }

  const license = normalizeOptionalText(body.license, 120);
  if (license === false) {
    return { message: "License must be 120 characters or fewer.", ok: false };
  }

  return {
    ok: true,
    value: {
      name,
      slug,
      description: description || undefined,
      visibility,
      version,
      servings,
      readme: readme || undefined,
      license: license || undefined,
    },
  };
}

function normalizeUpdateRepositoryBody(
  body: UpdateRepositoryBody,
  current: CloudRecipeRepository,
):
  | {
      ok: true;
      value: {
        name: string;
        slug: string;
        description?: string;
        visibility: RecipeRepositoryEntity["visibility"];
        version: string;
        servings: number;
        readme?: string;
        license?: string;
      };
    }
  | { message: string; ok: false } {
  if (!updateRepositoryFields.some((field) => Object.hasOwn(body, field))) {
    return { message: "At least one repository field must be provided.", ok: false };
  }

  const name = Object.hasOwn(body, "name") ? normalizeRequiredText(body.name, 120) : current.name;
  if (!name) {
    return { message: "Name must be a non-empty string up to 120 characters.", ok: false };
  }

  const slug = Object.hasOwn(body, "slug") ? normalizeRepositorySlug(body.slug) : current.slug;
  if (!slug) {
    return { message: "Slug must be 1-80 lowercase letters, numbers, or hyphens.", ok: false };
  }

  const visibility = Object.hasOwn(body, "visibility")
    ? normalizeExplicitVisibility(body.visibility)
    : current.visibility;
  if (!visibility) {
    return { message: "Visibility must be public, private, or unlisted.", ok: false };
  }

  const normalizedVersion = Object.hasOwn(body, "version")
    ? normalizeOptionalText(body.version, 32)
    : current.version;
  if (normalizedVersion === false) {
    return { message: "Version must be 32 characters or fewer.", ok: false };
  }
  const version = normalizedVersion || "0.1.0";

  const servings = Object.hasOwn(body, "servings")
    ? normalizeServings(body.servings)
    : current.servings;
  if (!servings) {
    return { message: "Servings must be an integer between 1 and 999.", ok: false };
  }

  const description = Object.hasOwn(body, "description")
    ? normalizeOptionalText(body.description, 280)
    : (current.description ?? "");
  if (description === false) {
    return { message: "Description must be 280 characters or fewer.", ok: false };
  }

  const readme = Object.hasOwn(body, "readme")
    ? normalizeOptionalText(body.readme, 20_000)
    : (current.readme ?? "");
  if (readme === false) {
    return { message: "README must be 20000 characters or fewer.", ok: false };
  }

  const license = Object.hasOwn(body, "license")
    ? normalizeOptionalText(body.license, 120)
    : (current.license ?? "");
  if (license === false) {
    return { message: "License must be 120 characters or fewer.", ok: false };
  }

  return {
    ok: true,
    value: {
      name,
      slug,
      description: description || undefined,
      visibility,
      version,
      servings,
      readme: readme || undefined,
      license: license || undefined,
    },
  };
}

function normalizeReplaceRepositoryDependenciesBody(
  body: ReplaceRepositoryDependenciesBody,
  repositoryId: string,
  options: RepositoryRouteOptions,
):
  | {
      ok: true;
      value: {
        components: RecipeComponent[];
      };
    }
  | { message: string; ok: false } {
  if (!Array.isArray(body.components)) {
    return { message: "Components must be an array.", ok: false };
  }

  if (body.components.length > maxDependencyReplacementRows) {
    return { message: "Components must contain 38 items or fewer.", ok: false };
  }

  const componentIds = new Set<string>();
  const components: RecipeComponent[] = [];
  let replacementRows = 0;

  for (const [index, value] of body.components.entries()) {
    const component = normalizeRecipeComponentBody(value, repositoryId, options);
    if (!component.ok) {
      return { message: `Component ${index + 1}: ${component.message}`, ok: false };
    }

    if (componentIds.has(component.value.id)) {
      return { message: "Component ids must be unique.", ok: false };
    }

    componentIds.add(component.value.id);
    replacementRows += 1 + component.value.transitiveDependencies.length;
    if (replacementRows > maxDependencyReplacementRows) {
      return {
        message: "Components and transitive dependencies must contain 38 total rows or fewer.",
        ok: false,
      };
    }

    components.push(component.value);
  }

  return { ok: true, value: { components } };
}

function normalizeRecipeComponentBody(
  value: unknown,
  repositoryId: string,
  options: RepositoryRouteOptions,
): { ok: true; value: RecipeComponent } | { message: string; ok: false } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { message: "Component must be a JSON object.", ok: false };
  }

  const body = value as Record<string, unknown>;
  const id = normalizeOptionalId(
    body.id,
    options.createRecipeComponentId ?? (() => crypto.randomUUID()),
  );
  if (!id) {
    return { message: "Id must be a non-empty string up to 120 characters.", ok: false };
  }

  const ingredientName = normalizeRequiredText(body.ingredientName, 120);
  if (!ingredientName) {
    return { message: "Ingredient name must be 1-120 characters.", ok: false };
  }

  const quantity = normalizeQuantity(body.quantity);
  if (quantity === null) {
    return { message: "Quantity must be a finite number greater than or equal to 0.", ok: false };
  }

  const unit = normalizeUnit(body.unit);
  if (!unit) {
    return { message: "Unit must be a known recipe unit.", ok: false };
  }

  const dependencyType = normalizeDependencyType(body.dependencyType);
  if (!dependencyType) {
    return { message: "Dependency type must be a known recipe dependency type.", ok: false };
  }

  const required = normalizeOptionalBoolean(body.required);
  if (required === null) {
    return { message: "Required must be a boolean.", ok: false };
  }

  const allergens = normalizeAllergenArray(body.allergens);
  if (!allergens) {
    return { message: "Allergens must be known allergen strings.", ok: false };
  }

  const alternatives = normalizeStringArray(body.alternatives, 20, 120);
  if (!alternatives) {
    return { message: "Alternatives must be strings up to 120 characters.", ok: false };
  }

  const dependencies = normalizeIngredientDependencies(body.transitiveDependencies);
  if (!dependencies.ok) {
    return dependencies;
  }

  return {
    ok: true,
    value: {
      id,
      recipeId: repositoryId,
      ingredientName,
      quantity,
      unit,
      dependencyType,
      required: required ?? true,
      allergens,
      alternatives,
      transitiveDependencies: dependencies.value,
    },
  };
}

function normalizeIngredientDependencies(
  value: unknown,
): { ok: true; value: IngredientDependency[] } | { message: string; ok: false } {
  if (value === undefined || value === null) {
    return { ok: true, value: [] };
  }

  if (!Array.isArray(value)) {
    return { message: "Transitive dependencies must be an array.", ok: false };
  }

  if (value.length > maxDependencyReplacementRows) {
    return { message: "Transitive dependencies must contain 38 items or fewer.", ok: false };
  }

  const dependencies: IngredientDependency[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { message: `Dependency ${index + 1}: Dependency must be a JSON object.`, ok: false };
    }

    const body = item as Record<string, unknown>;
    const name = normalizeRequiredText(body.name, 120);
    if (!name) {
      return { message: `Dependency ${index + 1}: Name must be 1-120 characters.`, ok: false };
    }

    const dependencyType = normalizeIngredientDependencyType(body.dependencyType);
    if (!dependencyType) {
      return {
        message: `Dependency ${index + 1}: Dependency type must be transitive, substitute, or peer.`,
        ok: false,
      };
    }

    const allergens = normalizeAllergenArray(body.allergens);
    if (!allergens) {
      return {
        message: `Dependency ${index + 1}: Allergens must be known allergen strings.`,
        ok: false,
      };
    }

    const notes = normalizeOptionalText(body.notes, 1000);
    if (notes === false) {
      return {
        message: `Dependency ${index + 1}: Notes must be 1000 characters or fewer.`,
        ok: false,
      };
    }

    dependencies.push({
      name,
      dependencyType,
      allergens,
      notes: notes || undefined,
    });
  }

  return { ok: true, value: dependencies };
}

async function findOwnedRepository(
  repositories: RecipeRepositoryMetadataRepository,
  ownerHandle: string,
  slug: string,
  owner: UserProfile,
  failureMessage: string,
): Promise<{ ok: true; repository: CloudRecipeRepository } | { ok: false; response: Response }> {
  let repository: CloudRecipeRepository | null;
  try {
    repository = await repositories.findByOwnerAndSlug(ownerHandle, slug);
  } catch {
    return { ok: false, response: serverError(failureMessage) };
  }

  if (!repository || repository.ownerUserId !== owner.id) {
    return { ok: false, response: repositoryNotFound() };
  }

  return { ok: true, repository };
}

async function resolveOptionalProfile(
  request: Request,
  env: WorkerEnv,
  options: RepositoryRouteOptions,
): Promise<
  | { kind: "profile"; profile: UserProfile }
  | { kind: "none"; profile?: undefined }
  | { kind: "error"; response: Response }
> {
  const result = await authenticateClerkRequest(request, env, options);
  if (!result.ok) {
    return { kind: "none" };
  }

  const profileResult = await requireBootstrappedProfile(result.session, env, options);
  if (!profileResult.ok) {
    return profileResult.response.status >= 500
      ? { kind: "error", response: profileResult.response }
      : { kind: "none" };
  }

  return { kind: "profile", profile: profileResult.profile };
}

function normalizeRepositorySlug(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const slug = value.trim().toLowerCase();
  if (slug.length < 1 || slug.length > 80 || !repositorySlugPattern.test(slug)) {
    return null;
  }

  return slug;
}

function normalizeVisibility(value: unknown): RecipeRepositoryEntity["visibility"] | null {
  if (typeof value === "undefined" || value === null || value === "") {
    return "public";
  }

  return normalizeExplicitVisibility(value);
}

function normalizeExplicitVisibility(value: unknown): RecipeRepositoryEntity["visibility"] | null {
  return typeof value === "string" && repositoryVisibilitySet.has(value)
    ? (value as RecipeRepositoryEntity["visibility"])
    : null;
}

function normalizeServings(value: unknown): number | null {
  if (typeof value === "undefined" || value === null || value === "") {
    return 2;
  }

  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 999
    ? value
    : null;
}

function normalizeQuantity(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function normalizeRequiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function normalizeOptionalText(value: unknown, maxLength: number): string | false {
  if (typeof value === "undefined" || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : false;
}

function normalizeOptionalId(value: unknown, fallback: () => string): string | null {
  if (value === undefined || value === null || value === "") {
    return fallback();
  }

  return normalizeRequiredText(value, 120);
}

function normalizeUnit(value: unknown): Unit | null {
  return typeof value === "string" && unitSet.has(value) ? (value as Unit) : null;
}

function normalizeDependencyType(value: unknown): DependencyType | null {
  return typeof value === "string" && dependencyTypeSet.has(value)
    ? (value as DependencyType)
    : null;
}

function normalizeIngredientDependencyType(value: unknown): IngredientDependencyType | null {
  return typeof value === "string" && ingredientDependencyTypeSet.has(value)
    ? (value as IngredientDependencyType)
    : null;
}

function normalizeOptionalBoolean(value: unknown): boolean | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "boolean" ? value : null;
}

function normalizeAllergenArray(value: unknown): Allergen[] | null {
  const items = normalizeStringArray(value, 20, 40);
  if (!items) {
    return null;
  }

  const allergens: Allergen[] = [];
  for (const item of items) {
    if (!allergenSet.has(item)) {
      return null;
    }

    if (!allergens.includes(item as Allergen)) {
      allergens.push(item as Allergen);
    }
  }

  return allergens;
}

function normalizeStringArray(
  value: unknown,
  maxItems: number,
  maxItemLength: number,
): string[] | null {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value) || value.length > maxItems) {
    return null;
  }

  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }

    const trimmed = item.trim();
    if (trimmed.length < 1 || trimmed.length > maxItemLength) {
      return null;
    }

    if (!items.includes(trimmed)) {
      items.push(trimmed);
    }
  }

  return items;
}

function getRecipeRepository(
  env: WorkerEnv,
  options: RepositoryRouteOptions,
): RecipeRepositoryMetadataRepository {
  return options.recipeRepositories ?? new D1RecipeRepository(env.DB);
}

function getRecipeComponentRepository(
  env: WorkerEnv,
  options: RepositoryRouteOptions,
): RecipeComponentWriteRepository {
  return options.recipeComponents ?? new D1RecipeComponentRepository(env.DB);
}

async function readRepositoryDependenciesBody(
  request: Request,
): Promise<
  { ok: true; value: ReplaceRepositoryDependenciesBody } | { message: string; ok: false }
> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { message: "Request body must be a JSON object.", ok: false };
    }

    return { ok: true, value: body };
  } catch {
    return { message: "Request body must be valid JSON.", ok: false };
  }
}

async function readRepositoryBody(
  request: Request,
): Promise<{ ok: true; value: CreateRepositoryBody } | { message: string; ok: false }> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { message: "Request body must be a JSON object.", ok: false };
    }

    return { ok: true, value: body };
  } catch {
    return { message: "Request body must be valid JSON.", ok: false };
  }
}

function serializeRepositoryResponse(repository: CloudRecipeRepository): RepositoryResponseBody {
  return {
    repository: serializeRepository(repository),
  };
}

function serializeRepository(repository: CloudRecipeRepository): SerializedRepository {
  return {
    id: repository.id,
    ownerHandle: repository.ownerHandle,
    name: repository.name,
    slug: repository.slug,
    description: repository.description,
    visibility: repository.visibility,
    version: repository.version,
    servings: repository.servings,
    tags: repository.tags,
    license: repository.license,
    maintainer: repository.maintainer,
    readme: repository.readme,
    sourceRepositoryId: repository.sourceRepositoryId,
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt,
  };
}

function serializeRecipeComponent(component: RecipeComponent): SerializedRecipeComponent {
  return {
    allergens: component.allergens,
    alternatives: component.alternatives,
    dependencyType: component.dependencyType,
    id: component.id,
    ingredientName: component.ingredientName,
    quantity: component.quantity,
    required: component.required,
    transitiveDependencies: component.transitiveDependencies.map(serializeIngredientDependency),
    unit: component.unit,
  };
}

function serializeIngredientDependency(
  dependency: IngredientDependency,
): SerializedIngredientDependency {
  return {
    allergens: dependency.allergens,
    dependencyType: dependency.dependencyType,
    name: dependency.name,
    notes: dependency.notes,
  };
}
