import type {
  AuditSummary,
  IngredientCategory,
  InventoryAuditResult,
  InventoryItem,
  RecipeAlert,
  RecipeComponent,
  RecipeRepositoryEntity,
  SeasoningBOM,
  Unit,
} from "../../domain";

export type CloudUserProfile = {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  contributionVisibility: "public" | "summary_only" | "private";
  createdAt: string;
  updatedAt: string;
};

export type CloudContributionLevel = 0 | 1 | 2 | 3 | 4;

export type CloudContributionDay = {
  date: string;
  contributionCount: number;
  level: CloudContributionLevel;
};

export type CloudContributionEvent = {
  id: string;
  eventType:
    | "recipe_created"
    | "recipe_updated"
    | "cooking_logged"
    | "eol_rescued"
    | "repository_forked";
  repositoryId?: string;
  occurredOn: string;
  occurredAt: string;
  contributionCount: number;
  visibility: "public" | "summary_only" | "private";
  metadata: Record<string, unknown>;
};

export type CloudContributionList = {
  profile: CloudUserProfile;
  from: string;
  to: string;
  totalContributions: number;
  days: CloudContributionDay[];
  detailsVisible: boolean;
};

export type CloudContributionDayDetail = {
  profile: CloudUserProfile;
  date: string;
  contributionCount: number;
  level: CloudContributionLevel;
  events: CloudContributionEvent[];
  detailsVisible: boolean;
};

export type CloudRepository = Omit<RecipeRepositoryEntity, "id"> & {
  id: string;
  sourceRepositoryId?: string;
};

export type CloudRecipeComponent = Omit<RecipeComponent, "notes" | "recipeId">;

export type CloudRepositoryDependencies = {
  repository: CloudRepository;
  components: CloudRecipeComponent[];
};

export type CloudRepositorySecurity = {
  generatedAt: string;
  recipeAlerts: RecipeAlert[];
  repository: CloudRepository;
  summary: AuditSummary;
};

export type CloudRepositoryAudit = {
  inventoryAudit: InventoryAuditResult;
  repository: CloudRepository;
};

export type CloudInventoryItem = InventoryItem;

export type CloudInventoryWriteInput = {
  bestBeforeDate?: string;
  category: IngredientCategory;
  hazardous: boolean;
  name: string;
  quantity: number;
  unit: Unit;
  useByDate?: string;
};

export type CloudProfileBootstrapInput = {
  avatarUrl?: string;
  displayName?: string;
  username: string;
};

export type CloudRepositoryWriteInput = {
  components: CloudRecipeComponent[];
  description?: string;
  license?: string;
  name: string;
  readme?: string;
  servings: number;
  slug: string;
  version: string;
  visibility: RecipeRepositoryEntity["visibility"];
};

export interface SeasoningBomApiClient {
  bootstrapProfile(input: CloudProfileBootstrapInput): Promise<CloudUserProfile>;
  createInventoryItem(input: CloudInventoryWriteInput): Promise<CloudInventoryItem>;
  createRepository(input: CloudRepositoryWriteInput): Promise<CloudRepository>;
  deleteInventoryItem(id: string): Promise<void>;
  deleteRepository(ownerHandle: string, slug: string): Promise<void>;
  getCurrentProfile(signal?: AbortSignal): Promise<CloudUserProfile>;
  getPublicProfile(username: string, signal?: AbortSignal): Promise<CloudUserProfile>;
  getUserContributions(username: string, signal?: AbortSignal): Promise<CloudContributionList>;
  getUserContributionDay(
    username: string,
    date: string,
    signal?: AbortSignal,
  ): Promise<CloudContributionDayDetail>;
  getRepository(ownerHandle: string, slug: string, signal?: AbortSignal): Promise<CloudRepository>;
  getRepositoryBom(ownerHandle: string, slug: string, signal?: AbortSignal): Promise<SeasoningBOM>;
  getRepositoryDependencies(
    ownerHandle: string,
    slug: string,
    signal?: AbortSignal,
  ): Promise<CloudRepositoryDependencies>;
  getRepositorySecurity(
    ownerHandle: string,
    slug: string,
    signal?: AbortSignal,
  ): Promise<CloudRepositorySecurity>;
  listInventory(signal?: AbortSignal): Promise<CloudInventoryItem[]>;
  listPublicRepositories(signal?: AbortSignal): Promise<CloudRepository[]>;
  runRepositoryAudit(
    ownerHandle: string,
    slug: string,
    signal?: AbortSignal,
  ): Promise<CloudRepositoryAudit>;
  updateInventoryItem(id: string, input: CloudInventoryWriteInput): Promise<CloudInventoryItem>;
  updateRepository(
    ownerHandle: string,
    slug: string,
    input: CloudRepositoryWriteInput,
  ): Promise<CloudRepository>;
}

export class CloudApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "CloudApiError";
  }
}

type Fetch = typeof fetch;
export type GetSessionToken = () => Promise<string | null>;

export function createSeasoningBomApiClient(
  baseUrl: string | undefined,
  fetcher: Fetch = fetch,
  getSessionToken: GetSessionToken = noSessionToken,
): SeasoningBomApiClient | null {
  const normalizedBaseUrl = baseUrl?.trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) {
    return null;
  }

  const get = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
    const token = await getOptionalSessionToken(getSessionToken);
    const response = await fetcher(`${normalizedBaseUrl}${path}`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    });
    const body = await readJson(response);

    if (!response.ok) {
      const error = readApiError(body);
      throw new CloudApiError(response.status, error.message, error.code);
    }

    return body as T;
  };

  const mutate = async <T>(
    method: "DELETE" | "PATCH" | "POST",
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> => {
    const token = await getRequiredSessionToken(getSessionToken);
    const response = await fetcher(`${normalizedBaseUrl}${path}`, {
      body: typeof body === "undefined" ? undefined : JSON.stringify(body),
      credentials: "include",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(typeof body === "undefined" ? {} : { "Content-Type": "application/json" }),
      },
      method,
      signal,
    });
    const responseBody = response.status === 204 ? undefined : await readJson(response);

    if (!response.ok) {
      const error = readApiError(responseBody);
      throw new CloudApiError(response.status, error.message, error.code);
    }

    return responseBody as T;
  };

  return {
    async bootstrapProfile(input) {
      const response = await mutate<{ profile: CloudUserProfile }>("POST", "/me/profile", input);
      return response.profile;
    },
    async createRepository(input) {
      const response = await mutate<{ repository: CloudRepository }>("POST", "/repos", input);
      return response.repository;
    },
    async createInventoryItem(input) {
      const response = await mutate<{ inventoryItem: CloudInventoryItem }>(
        "POST",
        "/inventory",
        input,
      );
      return response.inventoryItem;
    },
    deleteInventoryItem(id) {
      return mutate<void>("DELETE", inventoryItemPath(id));
    },
    deleteRepository(ownerHandle, slug) {
      return mutate<void>("DELETE", repositoryPath(ownerHandle, slug));
    },
    async getCurrentProfile(signal) {
      const response = await get<{ profile: CloudUserProfile }>("/me", signal);
      return response.profile;
    },
    async getPublicProfile(username, signal) {
      const response = await get<{ profile: CloudUserProfile }>(
        `/users/${encodeURIComponent(username)}/profile`,
        signal,
      );
      return response.profile;
    },
    getUserContributionDay(username, date, signal) {
      return get<CloudContributionDayDetail>(
        `/users/${encodeURIComponent(username)}/contributions/${encodeURIComponent(date)}`,
        signal,
      );
    },
    getUserContributions(username, signal) {
      return get<CloudContributionList>(
        `/users/${encodeURIComponent(username)}/contributions`,
        signal,
      );
    },
    async getRepository(ownerHandle, slug, signal) {
      const response = await get<{ repository: CloudRepository }>(
        repositoryPath(ownerHandle, slug),
        signal,
      );
      return response.repository;
    },
    getRepositoryBom(ownerHandle, slug, signal) {
      return get<SeasoningBOM>(`${repositoryPath(ownerHandle, slug)}/bom`, signal);
    },
    getRepositoryDependencies(ownerHandle, slug, signal) {
      return get<CloudRepositoryDependencies>(
        `${repositoryPath(ownerHandle, slug)}/dependencies`,
        signal,
      );
    },
    getRepositorySecurity(ownerHandle, slug, signal) {
      return get<CloudRepositorySecurity>(`${repositoryPath(ownerHandle, slug)}/security`, signal);
    },
    async listInventory(signal) {
      const response = await get<{ inventoryItems: CloudInventoryItem[] }>("/inventory", signal);
      return response.inventoryItems;
    },
    async listPublicRepositories(signal) {
      const response = await get<{ repositories: CloudRepository[] }>("/repos", signal);
      return response.repositories;
    },
    runRepositoryAudit(ownerHandle, slug, signal) {
      return mutate<CloudRepositoryAudit>(
        "POST",
        `${repositoryPath(ownerHandle, slug)}/audit`,
        undefined,
        signal,
      );
    },
    async updateInventoryItem(id, input) {
      const response = await mutate<{ inventoryItem: CloudInventoryItem }>(
        "PATCH",
        inventoryItemPath(id),
        input,
      );
      return response.inventoryItem;
    },
    async updateRepository(ownerHandle, slug, input) {
      const response = await mutate<{ repository: CloudRepository }>(
        "PATCH",
        repositoryPath(ownerHandle, slug),
        input,
      );
      return response.repository;
    },
  };
}

async function noSessionToken(): Promise<null> {
  return null;
}

async function getOptionalSessionToken(getSessionToken: GetSessionToken): Promise<string | null> {
  try {
    return (await getSessionToken())?.trim() || null;
  } catch {
    return null;
  }
}

async function getRequiredSessionToken(getSessionToken: GetSessionToken): Promise<string> {
  let token: string | null;
  try {
    token = await getSessionToken();
  } catch {
    throw new CloudApiError(401, "Sign in again before saving changes.", "not_authenticated");
  }

  const normalizedToken = token?.trim();
  if (!normalizedToken) {
    throw new CloudApiError(401, "Sign in before saving changes.", "not_authenticated");
  }
  return normalizedToken;
}

function repositoryPath(ownerHandle: string, slug: string): string {
  return `/repos/${encodeURIComponent(ownerHandle)}/${encodeURIComponent(slug)}`;
}

function inventoryItemPath(id: string): string {
  return `/inventory/${encodeURIComponent(id)}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    if (response.ok) {
      throw new CloudApiError(response.status, "The API returned an invalid JSON response.");
    }
    return null;
  }
}

function readApiError(body: unknown): { code?: string; message: string } {
  if (!body || typeof body !== "object" || !("error" in body)) {
    return { message: "The API request failed." };
  }

  const error = body.error;
  if (!error || typeof error !== "object") {
    return { message: "The API request failed." };
  }

  return {
    code: "code" in error && typeof error.code === "string" ? error.code : undefined,
    message:
      "message" in error && typeof error.message === "string"
        ? error.message
        : "The API request failed.",
  };
}
