import {
  type Allergen,
  type AuditSummary,
  allergens,
  type DependencyType,
  defaultSettings,
  dependencyTypes,
  generateRecipeAlerts,
  generateSeasoningBOM,
  type IngredientDependency,
  type IngredientDependencyType,
  type InventoryAuditResult,
  type RecipeAlert,
  type RecipeComponent,
  type RecipeRepositoryEntity,
  repositoryVisibilities,
  runInventoryAudit,
  type SeasoningBOM,
  summarizeIssues,
  type Unit,
  units,
} from "../../domain";
import {
  D1InventoryRepository,
  type InventoryItemRepository,
} from "../../repositories/cloudflare-d1/D1InventoryRepository";
import {
  D1RecipeComponentRepository,
  type RecipeComponentWriteRepository,
} from "../../repositories/cloudflare-d1/D1RecipeComponentRepository";
import {
  type CloudRecipeRepository,
  D1RecipeRepository,
  type RecipeRepositoryMetadataRepository,
} from "../../repositories/cloudflare-d1/D1RecipeRepository";
import {
  D1RepositoryStarRepository,
  type RepositoryStarRepository,
} from "../../repositories/cloudflare-d1/D1RepositoryStarRepository";
import type { UserProfile } from "../../repositories/cloudflare-d1/D1UserProfileRepository";
import { authenticateClerkRequest, type ClerkAuthenticationOptions } from "../auth/clerk";
import { type ProfileRouteOptions, requireBootstrappedProfile } from "./profile";
import { badRequest, conflict, jsonResponse, repositoryNotFound, serverError } from "./responses";
import type { WorkerEnv } from "./types";

export type RepositoryRouteOptions = ClerkAuthenticationOptions &
  ProfileRouteOptions & {
    createContributionEventId?: () => string;
    createIngredientDependencyId?: () => string;
    createRecipeComponentId?: () => string;
    createRepositoryId?: () => string;
    inventoryItems?: InventoryItemRepository;
    now?: () => Date;
    recipeComponents?: RecipeComponentWriteRepository;
    recipeRepositories?: RecipeRepositoryMetadataRepository;
    repositoryStars?: RepositoryStarRepository;
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

type RepositoryComponentResponseBody = {
  component: SerializedRecipeComponent;
  repository: SerializedRepository;
};

type RepositoryDependencyResponseBody = {
  dependency: SerializedIngredientDependency;
  repository: SerializedRepository;
};

type RepositorySecurityResponseBody = {
  generatedAt: string;
  recipeAlerts: RecipeAlert[];
  repository: SerializedRepository;
  summary: AuditSummary;
};

type RepositoryAuditResponseBody = {
  inventoryAudit: InventoryAuditResult;
  repository: SerializedRepository;
};

type RepositoryStarResponseBody = {
  starred: boolean;
  repository: SerializedRepository;
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
  id?: string;
  name: string;
  dependencyType: IngredientDependencyType;
  allergens: Allergen[];
  notes?: string;
};

type ReplaceRepositoryDependenciesBody = {
  components?: unknown;
};

type CreateRepositoryBody = {
  components?: unknown;
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
  "components",
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

export async function handleGetRepositoryBom(
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
    "Failed to generate SeasoningBOM.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  try {
    const recipeComponents = await components.listByRepositoryId(repositoryResult.repository.id);
    const recipeAlerts = generateRecipeAlerts({
      components: recipeComponents,
      recipe: repositoryResult.repository,
    });
    const bom = generateSeasoningBOM({
      components: recipeComponents,
      generatedAt: options.now?.() ?? new Date(),
      recipe: repositoryResult.repository,
      recipeAlerts,
    });

    return jsonResponse(bom satisfies SeasoningBOM, {
      headers: {
        "content-disposition": `attachment; filename="${repositoryResult.repository.slug}-seasoningbom.json"`,
      },
    });
  } catch {
    return serverError("Failed to generate SeasoningBOM.");
  }
}

export async function handleGetRepositorySecurity(
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
    "Failed to load security alerts.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  try {
    const recipeComponents = await components.listByRepositoryId(repositoryResult.repository.id);
    const recipeAlerts = generateRecipeAlerts({
      components: recipeComponents,
      recipe: repositoryResult.repository,
    });
    const generatedAt = (options.now?.() ?? new Date()).toISOString();

    return jsonResponse({
      generatedAt,
      recipeAlerts,
      repository: serializeRepository(repositoryResult.repository),
      summary: summarizeIssues(recipeAlerts),
    } satisfies RepositorySecurityResponseBody);
  } catch {
    return serverError("Failed to load security alerts.");
  }
}

export async function handlePostRepositoryAudit(
  ownerHandle: string,
  slug: string,
  owner: UserProfile,
  env: WorkerEnv,
  options: RepositoryRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);
  const components = getRecipeComponentRepository(env, options);
  const inventory = getInventoryRepository(env, options);
  const repositoryResult = await findReadableRepositoryForProfile(
    repositories,
    ownerHandle,
    slug,
    owner,
    "Failed to run inventory audit.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  try {
    const [recipeComponents, inventoryItems] = await Promise.all([
      components.listByRepositoryId(repositoryResult.repository.id),
      inventory.listByUserId(owner.id),
    ]);
    const inventoryAudit = runInventoryAudit({
      components: recipeComponents,
      inventoryItems,
      now: options.now?.() ?? new Date(),
      recipe: repositoryResult.repository,
      settings: defaultSettings,
    });

    return jsonResponse({
      inventoryAudit,
      repository: serializeRepository(repositoryResult.repository),
    } satisfies RepositoryAuditResponseBody);
  } catch {
    return serverError("Failed to run inventory audit.");
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

export async function handlePostRepositoryComponent(
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
    "Failed to create component.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  const body = await readRepositoryDependenciesBody(request);
  if (!body.ok) {
    return badRequest(body.message);
  }

  const component = normalizeRecipeComponentBody(
    body.value,
    repositoryResult.repository.id,
    options,
  );
  if (!component.ok) {
    return badRequest(component.message);
  }
  if (componentRowCount(component.value) > maxDependencyReplacementRows) {
    return badRequest(
      "Components and transitive dependencies must contain 38 total rows or fewer.",
    );
  }

  const now = (options.now?.() ?? new Date()).toISOString();
  try {
    const created = await components.createComponent(
      repositoryResult.repository.id,
      component.value,
      now,
    );

    return jsonResponse(
      {
        component: serializeRecipeComponent(created),
        repository: serializeRepository(repositoryResult.repository),
      } satisfies RepositoryComponentResponseBody,
      { status: 201 },
    );
  } catch {
    return serverError("Failed to create component.");
  }
}

export async function handlePutRepositoryComponent(
  request: Request,
  ownerHandle: string,
  slug: string,
  componentId: string,
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
    "Failed to update component.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  const body = await readRepositoryDependenciesBody(request);
  if (!body.ok) {
    return badRequest(body.message);
  }

  const component = normalizeRecipeComponentBody(
    { ...body.value, id: componentId },
    repositoryResult.repository.id,
    options,
  );
  if (!component.ok) {
    return badRequest(component.message);
  }
  if (componentRowCount(component.value) > maxDependencyReplacementRows) {
    return badRequest(
      "Components and transitive dependencies must contain 38 total rows or fewer.",
    );
  }

  const now = (options.now?.() ?? new Date()).toISOString();
  try {
    const updated = await components.updateComponent(
      repositoryResult.repository.id,
      component.value,
      now,
    );
    if (!updated) {
      return repositoryNotFound();
    }

    return jsonResponse({
      component: serializeRecipeComponent(updated),
      repository: serializeRepository(repositoryResult.repository),
    } satisfies RepositoryComponentResponseBody);
  } catch {
    return serverError("Failed to update component.");
  }
}

export async function handleDeleteRepositoryComponent(
  ownerHandle: string,
  slug: string,
  componentId: string,
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
    "Failed to delete component.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  try {
    const deleted = await components.deleteComponent(repositoryResult.repository.id, componentId);
    return deleted ? new Response(null, { status: 204 }) : repositoryNotFound();
  } catch {
    return serverError("Failed to delete component.");
  }
}

export async function handlePostRepositoryDependency(
  request: Request,
  ownerHandle: string,
  slug: string,
  componentId: string,
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
    "Failed to create dependency.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  const body = await readRepositoryDependenciesBody(request);
  if (!body.ok) {
    return badRequest(body.message);
  }

  const dependency = normalizeIngredientDependencyBody(
    body.value,
    options.createIngredientDependencyId ?? (() => crypto.randomUUID()),
  );
  if (!dependency.ok) {
    return badRequest(dependency.message);
  }

  try {
    const created = await components.createDependency(
      repositoryResult.repository.id,
      componentId,
      dependency.value,
    );
    if (!created) {
      return repositoryNotFound();
    }

    return jsonResponse(
      {
        dependency: serializeIngredientDependency(created),
        repository: serializeRepository(repositoryResult.repository),
      } satisfies RepositoryDependencyResponseBody,
      { status: 201 },
    );
  } catch {
    return serverError("Failed to create dependency.");
  }
}

export async function handlePutRepositoryDependency(
  request: Request,
  ownerHandle: string,
  slug: string,
  componentId: string,
  dependencyId: string,
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
    "Failed to update dependency.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  const body = await readRepositoryDependenciesBody(request);
  if (!body.ok) {
    return badRequest(body.message);
  }

  const dependency = normalizeIngredientDependencyBody({ ...body.value, id: dependencyId });
  if (!dependency.ok) {
    return badRequest(dependency.message);
  }

  try {
    const updated = await components.updateDependency(
      repositoryResult.repository.id,
      componentId,
      dependency.value,
    );
    if (!updated) {
      return repositoryNotFound();
    }

    return jsonResponse({
      dependency: serializeIngredientDependency(updated),
      repository: serializeRepository(repositoryResult.repository),
    } satisfies RepositoryDependencyResponseBody);
  } catch {
    return serverError("Failed to update dependency.");
  }
}

export async function handleDeleteRepositoryDependency(
  ownerHandle: string,
  slug: string,
  componentId: string,
  dependencyId: string,
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
    "Failed to delete dependency.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  try {
    const deleted = await components.deleteDependency(
      repositoryResult.repository.id,
      componentId,
      dependencyId,
    );
    return deleted ? new Response(null, { status: 204 }) : repositoryNotFound();
  } catch {
    return serverError("Failed to delete dependency.");
  }
}

export async function handleGetRepositoryStar(
  request: Request,
  ownerHandle: string,
  slug: string,
  owner: UserProfile,
  env: WorkerEnv,
  options: RepositoryRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);
  const stars = getRepositoryStarRepository(env, options);
  const repositoryResult = await findReadableRepository(
    request,
    repositories,
    ownerHandle,
    slug,
    env,
    options,
    "Failed to load repository Star state.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  try {
    const starred = await stars.isStarred({
      repositoryId: repositoryResult.repository.id,
      userId: owner.id,
    });
    return jsonResponse({
      repository: serializeRepository(repositoryResult.repository),
      starred,
    } satisfies RepositoryStarResponseBody);
  } catch {
    return serverError("Failed to load repository Star state.");
  }
}

export async function handlePostRepositoryStar(
  request: Request,
  ownerHandle: string,
  slug: string,
  owner: UserProfile,
  env: WorkerEnv,
  options: RepositoryRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);
  const stars = getRepositoryStarRepository(env, options);
  const repositoryResult = await findReadableRepository(
    request,
    repositories,
    ownerHandle,
    slug,
    env,
    options,
    "Failed to star repository.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  const now = (options.now?.() ?? new Date()).toISOString();
  try {
    await stars.star({
      repositoryId: repositoryResult.repository.id,
      userId: owner.id,
      now,
    });

    return jsonResponse(
      {
        repository: serializeRepository(repositoryResult.repository),
        starred: true,
      } satisfies RepositoryStarResponseBody,
      { status: 201 },
    );
  } catch {
    return serverError("Failed to star repository.");
  }
}

export async function handleDeleteRepositoryStar(
  request: Request,
  ownerHandle: string,
  slug: string,
  owner: UserProfile,
  env: WorkerEnv,
  options: RepositoryRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);
  const stars = getRepositoryStarRepository(env, options);
  const repositoryResult = await findReadableRepository(
    request,
    repositories,
    ownerHandle,
    slug,
    env,
    options,
    "Failed to unstar repository.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  try {
    await stars.unstar({
      repositoryId: repositoryResult.repository.id,
      userId: owner.id,
    });

    return new Response(null, { status: 204 });
  } catch {
    return serverError("Failed to unstar repository.");
  }
}

export async function handlePostRepositoryFork(
  ownerHandle: string,
  slug: string,
  owner: UserProfile,
  env: WorkerEnv,
  options: RepositoryRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);
  const components = getRecipeComponentRepository(env, options);

  let sourceRepository: CloudRecipeRepository | null;
  try {
    sourceRepository = await repositories.findByOwnerAndSlug(ownerHandle, slug);
  } catch {
    return serverError("Failed to fork repository.");
  }

  if (
    !sourceRepository ||
    (sourceRepository.visibility !== "public" && sourceRepository.visibility !== "unlisted")
  ) {
    return repositoryNotFound();
  }

  let existingRepository: CloudRecipeRepository | null;
  try {
    existingRepository = await repositories.findByOwnerAndSlug(
      owner.username,
      sourceRepository.slug,
    );
  } catch {
    return serverError("Failed to fork repository.");
  }
  if (existingRepository) {
    return conflict(
      "repository_already_exists",
      "A repository with this owner and slug already exists.",
    );
  }

  const now = (options.now?.() ?? new Date()).toISOString();
  const id = options.createRepositoryId?.() ?? crypto.randomUUID();
  const contributionEventId = options.createContributionEventId?.() ?? crypto.randomUUID();
  let sourceComponents: RecipeComponent[];
  try {
    sourceComponents = await components.listByRepositoryId(sourceRepository.id);
  } catch {
    return serverError("Failed to fork repository.");
  }
  const forkedComponents = cloneComponentsForFork(sourceComponents, id, options);

  try {
    const { repository } = await repositories.createWithContribution({
      components: forkedComponents,
      contribution: {
        eventType: "repository_forked",
        id: contributionEventId,
        metadata: buildRepositoryContributionMetadata({
          name: sourceRepository.name,
          ownerHandle: owner.username,
          slug: sourceRepository.slug,
          sourceRepositoryId: sourceRepository.id,
          sourceRepositoryOwnerHandle: sourceRepository.ownerHandle,
          sourceRepositorySlug: sourceRepository.slug,
          version: sourceRepository.version,
        }),
        occurredAt: now,
        occurredOn: contributionDateFromIso(now),
        visibility: contributionVisibilityForRepository(owner.contributionVisibility, "public"),
      },
      description: sourceRepository.description,
      id,
      license: sourceRepository.license,
      name: sourceRepository.name,
      now,
      ownerHandle: owner.username,
      ownerUserId: owner.id,
      readme: sourceRepository.readme,
      servings: sourceRepository.servings,
      slug: sourceRepository.slug,
      sourceRepositoryId: sourceRepository.id,
      version: sourceRepository.version,
      visibility: "public",
    });

    return jsonResponse(serializeRepositoryResponse(repository), { status: 201 });
  } catch {
    try {
      const repositoryAfterCreate = await repositories.findByOwnerAndSlug(
        owner.username,
        sourceRepository.slug,
      );
      if (repositoryAfterCreate) {
        return conflict(
          "repository_already_exists",
          "A repository with this owner and slug already exists.",
        );
      }
    } catch {
      return serverError("Failed to fork repository.");
    }

    return serverError("Failed to fork repository.");
  }
}

function cloneComponentsForFork(
  components: RecipeComponent[],
  repositoryId: string,
  options: RepositoryRouteOptions,
): RecipeComponent[] {
  return components.map((component) => ({
    ...component,
    allergens: [...component.allergens],
    alternatives: [...component.alternatives],
    id: options.createRecipeComponentId?.() ?? crypto.randomUUID(),
    recipeId: repositoryId,
    transitiveDependencies: component.transitiveDependencies.map((dependency) => ({
      ...dependency,
      allergens: [...dependency.allergens],
      id: options.createIngredientDependencyId?.() ?? crypto.randomUUID(),
    })),
  }));
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

async function findReadableRepositoryForProfile(
  repositories: RecipeRepositoryMetadataRepository,
  ownerHandle: string,
  slug: string,
  viewer: UserProfile,
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

  if (repository.visibility === "private" && repository.ownerUserId !== viewer.id) {
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
  const contributionEventId = options.createContributionEventId?.() ?? crypto.randomUUID();
  const manifest = Object.hasOwn(body.value, "components")
    ? normalizeReplaceRepositoryDependenciesBody({ components: body.value.components }, id, options)
    : null;
  if (manifest && !manifest.ok) {
    return badRequest(manifest.message);
  }

  try {
    const { repository } = await repositories.createWithContribution({
      ...input.value,
      components: manifest?.value.components,
      contribution: {
        eventType: "recipe_created",
        id: contributionEventId,
        metadata: buildRepositoryContributionMetadata({
          name: input.value.name,
          ownerHandle: owner.username,
          slug: input.value.slug,
          version: input.value.version,
        }),
        occurredAt: now,
        occurredOn: contributionDateFromIso(now),
        visibility: contributionVisibilityForRepository(
          owner.contributionVisibility,
          input.value.visibility,
        ),
      },
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

  const manifest = Object.hasOwn(body.value, "components")
    ? normalizeReplaceRepositoryDependenciesBody(
        { components: body.value.components },
        currentResult.repository.id,
        options,
      )
    : null;
  if (manifest && !manifest.ok) {
    return badRequest(manifest.message);
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
  const contributionEventId = options.createContributionEventId?.() ?? crypto.randomUUID();
  let componentsChanged = false;
  if (manifest?.ok) {
    try {
      const currentComponents = await getRecipeComponentRepository(env, options).listByRepositoryId(
        currentResult.repository.id,
      );
      componentsChanged = !recipeComponentsEqual(currentComponents, manifest.value.components);
    } catch {
      return serverError("Failed to update repository.");
    }
  }
  const shouldRecordContribution =
    componentsChanged ||
    shouldRecordRecipeUpdateContribution(currentResult.repository, input.value);

  try {
    const updateInput = {
      ...input.value,
      ...(manifest?.ok && componentsChanged ? { components: manifest.value.components } : {}),
      id: currentResult.repository.id,
      ownerHandle: currentResult.repository.ownerHandle,
      ownerUserId: currentResult.repository.ownerUserId,
      sourceRepositoryId: currentResult.repository.sourceRepositoryId,
      createdAt: currentResult.repository.createdAt,
      now,
    };
    const repository = shouldRecordContribution
      ? (
          await repositories.updateWithContribution({
            ...updateInput,
            contribution: {
              eventType: "recipe_updated",
              id: contributionEventId,
              metadata: buildRepositoryContributionMetadata({
                name: input.value.name,
                ownerHandle: currentResult.repository.ownerHandle,
                previousSlug:
                  input.value.slug === currentResult.repository.slug
                    ? undefined
                    : currentResult.repository.slug,
                slug: input.value.slug,
                version: input.value.version,
              }),
              occurredAt: now,
              occurredOn: contributionDateFromIso(now),
              visibility: contributionVisibilityForRepository(
                owner.contributionVisibility,
                input.value.visibility,
              ),
            },
          })
        ).repository
      : await repositories.update(updateInput);

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

function componentRowCount(component: RecipeComponent): number {
  return 1 + component.transitiveDependencies.length;
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
    const dependency = normalizeIngredientDependencyBody(item);
    if (!dependency.ok) {
      return { message: `Dependency ${index + 1}: ${dependency.message}`, ok: false };
    }

    dependencies.push(dependency.value);
  }

  return { ok: true, value: dependencies };
}

function normalizeIngredientDependencyBody(
  value: unknown,
  fallbackId?: () => string,
): { ok: true; value: IngredientDependency } | { message: string; ok: false } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { message: "Dependency must be a JSON object.", ok: false };
  }

  const body = value as Record<string, unknown>;
  let id: string | undefined;
  if (Object.hasOwn(body, "id")) {
    const normalizedId = normalizeRequiredText(body.id, 120);
    if (!normalizedId) {
      return { message: "Id must be a non-empty string up to 120 characters.", ok: false };
    }
    id = normalizedId;
  } else if (fallbackId) {
    id = fallbackId();
  }

  const name = normalizeRequiredText(body.name, 120);
  if (!name) {
    return { message: "Name must be 1-120 characters.", ok: false };
  }

  const dependencyType = normalizeIngredientDependencyType(body.dependencyType);
  if (!dependencyType) {
    return {
      message: "Dependency type must be transitive, substitute, or peer.",
      ok: false,
    };
  }

  const allergens = normalizeAllergenArray(body.allergens);
  if (!allergens) {
    return { message: "Allergens must be known allergen strings.", ok: false };
  }

  const notes = normalizeOptionalText(body.notes, 1000);
  if (notes === false) {
    return { message: "Notes must be 1000 characters or fewer.", ok: false };
  }

  return {
    ok: true,
    value: {
      allergens,
      dependencyType,
      id,
      name,
      notes: notes || undefined,
    },
  };
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

function buildRepositoryContributionMetadata(input: {
  name: string;
  ownerHandle: string;
  previousSlug?: string;
  slug: string;
  sourceRepositoryId?: string;
  sourceRepositoryOwnerHandle?: string;
  sourceRepositorySlug?: string;
  version: string;
}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      previousRepositorySlug: input.previousSlug,
      repositoryName: input.name,
      repositoryOwnerHandle: input.ownerHandle,
      repositorySlug: input.slug,
      sourceRepositoryId: input.sourceRepositoryId,
      sourceRepositoryOwnerHandle: input.sourceRepositoryOwnerHandle,
      sourceRepositorySlug: input.sourceRepositorySlug,
      version: input.version,
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function shouldRecordRecipeUpdateContribution(
  current: CloudRecipeRepository,
  next: {
    name: string;
    slug: string;
    description?: string;
    version: string;
    servings: number;
    readme?: string;
    license?: string;
  },
): boolean {
  return (
    current.name !== next.name ||
    current.slug !== next.slug ||
    (current.description ?? undefined) !== (next.description ?? undefined) ||
    current.version !== next.version ||
    current.servings !== next.servings ||
    (current.readme ?? undefined) !== (next.readme ?? undefined) ||
    (current.license ?? undefined) !== (next.license ?? undefined)
  );
}

function recipeComponentsEqual(current: RecipeComponent[], next: RecipeComponent[]): boolean {
  return (
    JSON.stringify(toComparableComponents(current)) === JSON.stringify(toComparableComponents(next))
  );
}

function toComparableComponents(components: RecipeComponent[]) {
  return components
    .map((component) => ({
      allergens: [...component.allergens].sort(),
      alternatives: [...component.alternatives].sort(),
      dependencyType: component.dependencyType,
      ingredientName: component.ingredientName,
      quantity: component.quantity,
      required: component.required,
      transitiveDependencies: component.transitiveDependencies
        .map((dependency) => ({
          allergens: [...dependency.allergens].sort(),
          dependencyType: dependency.dependencyType,
          name: dependency.name,
          notes: dependency.notes,
        }))
        .sort((left, right) =>
          `${left.name}:${left.dependencyType}`.localeCompare(
            `${right.name}:${right.dependencyType}`,
          ),
        ),
      unit: component.unit,
    }))
    .sort((left, right) =>
      `${left.ingredientName}:${left.dependencyType}`.localeCompare(
        `${right.ingredientName}:${right.dependencyType}`,
      ),
    );
}

function contributionVisibilityForRepository(
  userContributionVisibility: UserProfile["contributionVisibility"],
  repositoryVisibility: RecipeRepositoryEntity["visibility"],
): UserProfile["contributionVisibility"] {
  return repositoryVisibility === "private" ? "private" : userContributionVisibility;
}

function contributionDateFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function getRecipeComponentRepository(
  env: WorkerEnv,
  options: RepositoryRouteOptions,
): RecipeComponentWriteRepository {
  return options.recipeComponents ?? new D1RecipeComponentRepository(env.DB);
}

function getInventoryRepository(
  env: WorkerEnv,
  options: RepositoryRouteOptions,
): InventoryItemRepository {
  return options.inventoryItems ?? new D1InventoryRepository(env.DB);
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

function getRepositoryStarRepository(
  env: WorkerEnv,
  options: RepositoryRouteOptions,
): RepositoryStarRepository {
  return options.repositoryStars ?? new D1RepositoryStarRepository(env.DB);
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
    id: dependency.id,
    name: dependency.name,
    notes: dependency.notes,
  };
}
