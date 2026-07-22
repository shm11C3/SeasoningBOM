import type {
  AuditSummary,
  RecipeAlert,
  RecipeComponent,
  RecipeRepositoryEntity,
  SeasoningBOM,
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

export interface SeasoningBomApiClient {
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
  listPublicRepositories(signal?: AbortSignal): Promise<CloudRepository[]>;
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

export function createSeasoningBomApiClient(
  baseUrl: string | undefined,
  fetcher: Fetch = fetch,
): SeasoningBomApiClient | null {
  const normalizedBaseUrl = baseUrl?.trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) {
    return null;
  }

  const get = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
    const response = await fetcher(`${normalizedBaseUrl}${path}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
      signal,
    });
    const body = await readJson(response);

    if (!response.ok) {
      const error = readApiError(body);
      throw new CloudApiError(response.status, error.message, error.code);
    }

    return body as T;
  };

  return {
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
    async listPublicRepositories(signal) {
      const response = await get<{ repositories: CloudRepository[] }>("/repos", signal);
      return response.repositories;
    },
  };
}

function repositoryPath(ownerHandle: string, slug: string): string {
  return `/repos/${encodeURIComponent(ownerHandle)}/${encodeURIComponent(slug)}`;
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
