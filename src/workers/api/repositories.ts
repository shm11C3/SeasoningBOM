import { type RecipeRepositoryEntity, repositoryVisibilities } from "../../domain";
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
    createRepositoryId?: () => string;
    now?: () => Date;
    recipeRepositories?: RecipeRepositoryMetadataRepository;
  };

type RepositoryResponseBody = {
  repository: SerializedRepository;
};

type RepositoryListResponseBody = {
  repositories: SerializedRepository[];
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
const repositoryVisibilitySet = new Set<string>(repositoryVisibilities);
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

  let repository: CloudRecipeRepository | null;
  try {
    repository = await repositories.findByOwnerAndSlug(ownerHandle, slug);
  } catch {
    return serverError("Failed to load repository.");
  }

  if (!repository) {
    return repositoryNotFound();
  }

  if (repository.visibility === "public" || repository.visibility === "unlisted") {
    return jsonResponse(serializeRepositoryResponse(repository));
  }

  const viewer = await resolveOptionalProfile(request, env, options);
  if (viewer.kind === "error") {
    return viewer.response;
  }

  if (viewer.profile?.id !== repository.ownerUserId) {
    return repositoryNotFound();
  }

  return jsonResponse(serializeRepositoryResponse(repository));
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

function getRecipeRepository(
  env: WorkerEnv,
  options: RepositoryRouteOptions,
): RecipeRepositoryMetadataRepository {
  return options.recipeRepositories ?? new D1RecipeRepository(env.DB);
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
