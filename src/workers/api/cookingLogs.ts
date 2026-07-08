import { calculateLifecycleStatus, defaultSettings } from "../../domain";
import type { CloudContributionEvent } from "../../repositories/cloudflare-d1/D1ContributionEvent";
import {
  type CloudCookingLog,
  type CookingLogRepository,
  D1CookingLogRepository,
  type EolRescuedInventoryItem,
} from "../../repositories/cloudflare-d1/D1CookingLogRepository";
import {
  type CloudInventoryItem,
  D1InventoryRepository,
  type InventoryItemRepository,
} from "../../repositories/cloudflare-d1/D1InventoryRepository";
import {
  type CloudRecipeRepository,
  D1RecipeRepository,
  type RecipeRepositoryMetadataRepository,
} from "../../repositories/cloudflare-d1/D1RecipeRepository";
import type { UserProfile } from "../../repositories/cloudflare-d1/D1UserProfileRepository";
import { authenticateClerkRequest } from "../auth/clerk";
import { type ProfileRouteOptions, requireBootstrappedProfile } from "./profile";
import type { RepositoryRouteOptions } from "./repositories";
import { badRequest, jsonResponse, repositoryNotFound, serverError } from "./responses";
import type { WorkerEnv } from "./types";

export type CookingLogRouteOptions = ProfileRouteOptions &
  RepositoryRouteOptions & {
    cookingLogs?: CookingLogRepository;
    createContributionEventId?: () => string;
    createCookingLogId?: () => string;
    createEolRescueContributionEventId?: () => string;
  };

type CookingLogBody = {
  cookedAt?: unknown;
  notes?: unknown;
  result?: unknown;
  usedInventoryItemIds?: unknown;
};

type SerializedCookingLog = {
  id: string;
  userId: string;
  authorHandle: string;
  authorDisplayName?: string;
  repositoryId: string;
  recipeVersion: string;
  result: string;
  notes?: string;
  cookedAt: string;
  createdAt: string;
};

type SerializedContributionEvent = {
  id: string;
  userId: string;
  eventType: CloudContributionEvent["eventType"];
  repositoryId?: string;
  occurredOn: string;
  occurredAt: string;
  contributionCount: number;
  visibility: CloudContributionEvent["visibility"];
  metadata: Record<string, unknown>;
};

type SerializedRepository = {
  id: string;
  ownerHandle: string;
  name: string;
  slug: string;
  description?: string;
  visibility: CloudRecipeRepository["visibility"];
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

type CookingLogListResponseBody = {
  cookingLogs: SerializedCookingLog[];
  repository: SerializedRepository;
};

type CookingLogResponseBody = {
  contributionEvent: SerializedContributionEvent;
  eolRescueContributionEvent?: SerializedContributionEvent;
  cookingLog: SerializedCookingLog;
  repository: SerializedRepository;
};

export async function handleGetCookingLogs(
  request: Request,
  ownerHandle: string,
  slug: string,
  env: WorkerEnv,
  options: CookingLogRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);
  const cookingLogs = getCookingLogRepository(env, options);
  const viewer = await resolveOptionalProfile(request, env, options);
  if (viewer.kind === "error") {
    return viewer.response;
  }

  const repositoryResult = await findReadableRepository(
    repositories,
    ownerHandle,
    slug,
    viewer.profile,
    "Failed to load cooking logs.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  try {
    const visibleLogs = await cookingLogs.listVisibleForRepository({
      repositoryId: repositoryResult.repository.id,
      viewerUserId: viewer.profile?.id,
    });

    return jsonResponse({
      cookingLogs: visibleLogs.map(serializeCookingLog),
      repository: serializeRepository(repositoryResult.repository),
    } satisfies CookingLogListResponseBody);
  } catch {
    return serverError("Failed to load cooking logs.");
  }
}

export async function handlePostCookingLog(
  request: Request,
  ownerHandle: string,
  slug: string,
  actor: UserProfile,
  env: WorkerEnv,
  options: CookingLogRouteOptions = {},
): Promise<Response> {
  const repositories = getRecipeRepository(env, options);
  const cookingLogs = getCookingLogRepository(env, options);
  const repositoryResult = await findReadableRepository(
    repositories,
    ownerHandle,
    slug,
    actor,
    "Failed to create cooking log.",
  );
  if (!repositoryResult.ok) {
    return repositoryResult.response;
  }

  const body = await readCookingLogBody(request);
  if (!body.ok) {
    return badRequest(body.message);
  }

  const now = options.now?.() ?? new Date();
  const input = normalizeCookingLogBody(body.value, now);
  if (!input.ok) {
    return badRequest(input.message);
  }

  const cookingLogId = options.createCookingLogId?.() ?? crypto.randomUUID();
  const contributionEventId = options.createContributionEventId?.() ?? crypto.randomUUID();
  const repository = repositoryResult.repository;
  const usedInventoryItemsResult = await resolveUsedInventoryItems(
    actor.id,
    input.value.usedInventoryItemIds,
    env,
    options,
  );
  if (!usedInventoryItemsResult.ok) {
    return usedInventoryItemsResult.response;
  }
  const eolRescuedItems = findEolRescuedItems(
    usedInventoryItemsResult.items,
    new Date(input.value.cookedAt),
  );

  try {
    const result = await cookingLogs.createWithContribution({
      authorDisplayName: actor.displayName,
      authorHandle: actor.username,
      contributionEventId,
      contributionVisibility: actor.contributionVisibility,
      cookedAt: input.value.cookedAt,
      cookingLogId,
      eolRescueContribution:
        eolRescuedItems.length > 0
          ? {
              id: options.createEolRescueContributionEventId?.() ?? crypto.randomUUID(),
              rescuedItems: eolRescuedItems,
            }
          : undefined,
      notes: input.value.notes,
      now: now.toISOString(),
      occurredOn: input.value.cookedAt.slice(0, 10),
      recipeVersion: repository.version,
      repositoryId: repository.id,
      repositoryName: repository.name,
      repositoryOwnerHandle: repository.ownerHandle,
      repositorySlug: repository.slug,
      result: input.value.result,
      userId: actor.id,
      usedInventoryItemIds: usedInventoryItemsResult.items.map((item) => item.id),
    });

    return jsonResponse(
      {
        contributionEvent: serializeContributionEvent(result.contributionEvent),
        eolRescueContributionEvent: result.eolRescueContributionEvent
          ? serializeContributionEvent(result.eolRescueContributionEvent)
          : undefined,
        cookingLog: serializeCookingLog(result.cookingLog),
        repository: serializeRepository(repository),
      } satisfies CookingLogResponseBody,
      { status: 201 },
    );
  } catch {
    return serverError("Failed to create cooking log.");
  }
}

function getRecipeRepository(
  env: WorkerEnv,
  options: CookingLogRouteOptions,
): RecipeRepositoryMetadataRepository {
  return options.recipeRepositories ?? new D1RecipeRepository(env.DB);
}

function getCookingLogRepository(
  env: WorkerEnv,
  options: CookingLogRouteOptions,
): CookingLogRepository {
  return options.cookingLogs ?? new D1CookingLogRepository(env.DB);
}

function getInventoryRepository(
  env: WorkerEnv,
  options: CookingLogRouteOptions,
): InventoryItemRepository {
  return options.inventoryItems ?? new D1InventoryRepository(env.DB);
}

async function findReadableRepository(
  repositories: RecipeRepositoryMetadataRepository,
  ownerHandle: string,
  slug: string,
  viewer: UserProfile | undefined,
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

  if (repository.visibility === "private" && viewer?.id !== repository.ownerUserId) {
    return { ok: false, response: repositoryNotFound() };
  }

  return { ok: true, repository };
}

async function resolveOptionalProfile(
  request: Request,
  env: WorkerEnv,
  options: CookingLogRouteOptions,
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

async function readCookingLogBody(
  request: Request,
): Promise<{ ok: true; value: CookingLogBody } | { message: string; ok: false }> {
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

function normalizeCookingLogBody(
  body: CookingLogBody,
  fallbackDate: Date,
):
  | {
      ok: true;
      value: {
        cookedAt: string;
        notes?: string;
        result: string;
        usedInventoryItemIds: string[];
      };
    }
  | { message: string; ok: false } {
  const result = normalizeRequiredText(body.result, 80);
  if (!result) {
    return { message: "Result must be 1-80 characters.", ok: false };
  }

  const notes = normalizeOptionalText(body.notes, 2000);
  if (notes === false) {
    return { message: "Notes must be 2000 characters or fewer.", ok: false };
  }

  const cookedAt = normalizeOptionalDateTime(body.cookedAt, fallbackDate);
  if (!cookedAt) {
    return { message: "Cooked at must be a valid date-time string.", ok: false };
  }

  const usedInventoryItemIds = normalizeUsedInventoryItemIds(body.usedInventoryItemIds);
  if (!usedInventoryItemIds.ok) {
    return usedInventoryItemIds;
  }

  return {
    ok: true,
    value: {
      cookedAt,
      notes: notes || undefined,
      result,
      usedInventoryItemIds: usedInventoryItemIds.value,
    },
  };
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

function normalizeOptionalDateTime(value: unknown, fallbackDate: Date): string | false {
  if (typeof value === "undefined" || value === null || value === "") {
    return fallbackDate.toISOString();
  }

  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value.trim());
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return new Date(timestamp).toISOString();
}

function normalizeUsedInventoryItemIds(
  value: unknown,
): { ok: true; value: string[] } | { message: string; ok: false } {
  if (typeof value === "undefined" || value === null) {
    return { ok: true, value: [] };
  }

  if (!Array.isArray(value) || value.length > 20) {
    return {
      message: "Used inventory item IDs must be an array of up to 20 strings.",
      ok: false,
    };
  }

  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return {
        message: "Used inventory item IDs must be an array of up to 20 strings.",
        ok: false,
      };
    }

    const id = item.trim();
    if (id.length === 0 || id.length > 128) {
      return {
        message: "Used inventory item IDs must be an array of up to 20 strings.",
        ok: false,
      };
    }
    ids.push(id);
  }

  return { ok: true, value: [...new Set(ids)] };
}

async function resolveUsedInventoryItems(
  userId: string,
  usedInventoryItemIds: string[],
  env: WorkerEnv,
  options: CookingLogRouteOptions,
): Promise<{ ok: true; items: CloudInventoryItem[] } | { ok: false; response: Response }> {
  if (usedInventoryItemIds.length === 0) {
    return { ok: true, items: [] };
  }

  try {
    const inventory = getInventoryRepository(env, options);
    const ownedItems = await inventory.listByUserId(userId);
    const ownedItemsById = new Map(ownedItems.map((item) => [item.id, item]));
    const usedItems = usedInventoryItemIds
      .map((id) => ownedItemsById.get(id))
      .filter((item): item is CloudInventoryItem => Boolean(item));

    if (usedItems.length !== usedInventoryItemIds.length) {
      return {
        ok: false,
        response: badRequest("Used inventory items must belong to the signed-in user."),
      };
    }

    return { ok: true, items: usedItems };
  } catch {
    return { ok: false, response: serverError("Failed to create cooking log.") };
  }
}

function findEolRescuedItems(
  usedInventoryItems: CloudInventoryItem[],
  cookedAt: Date,
): EolRescuedInventoryItem[] {
  return usedInventoryItems
    .filter((item) => {
      const status = calculateLifecycleStatus({
        deprecatedThresholdDays: defaultSettings.deprecatedThresholdDays,
        item,
        now: cookedAt,
      });
      return status === "deprecated";
    })
    .map((item) => ({
      bestBeforeDate: item.bestBeforeDate,
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
    }));
}

function serializeCookingLog(cookingLog: CloudCookingLog): SerializedCookingLog {
  return {
    authorDisplayName: cookingLog.authorDisplayName,
    authorHandle: cookingLog.authorHandle,
    cookedAt: cookingLog.cookedAt,
    createdAt: cookingLog.createdAt,
    id: cookingLog.id,
    notes: cookingLog.notes,
    recipeVersion: cookingLog.recipeVersion,
    repositoryId: cookingLog.repositoryId,
    result: cookingLog.result,
    userId: cookingLog.userId,
  };
}

function serializeContributionEvent(
  contributionEvent: CloudContributionEvent,
): SerializedContributionEvent {
  return {
    contributionCount: contributionEvent.contributionCount,
    eventType: contributionEvent.eventType,
    id: contributionEvent.id,
    metadata: contributionEvent.metadata,
    occurredAt: contributionEvent.occurredAt,
    occurredOn: contributionEvent.occurredOn,
    repositoryId: contributionEvent.repositoryId,
    userId: contributionEvent.userId,
    visibility: contributionEvent.visibility,
  };
}

function serializeRepository(repository: CloudRecipeRepository): SerializedRepository {
  return {
    createdAt: repository.createdAt,
    description: repository.description,
    id: repository.id,
    license: repository.license,
    maintainer: repository.maintainer,
    name: repository.name,
    ownerHandle: repository.ownerHandle,
    readme: repository.readme,
    servings: repository.servings,
    slug: repository.slug,
    sourceRepositoryId: repository.sourceRepositoryId,
    tags: repository.tags,
    updatedAt: repository.updatedAt,
    version: repository.version,
    visibility: repository.visibility,
  };
}
