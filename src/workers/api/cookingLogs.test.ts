import { describe, expect, it } from "vitest";
import type { CloudContributionEvent } from "../../repositories/cloudflare-d1/D1ContributionEvent";
import type {
  CloudCookingLog,
  CookingLogRepository,
  CreateCookingLogWithContributionInput,
} from "../../repositories/cloudflare-d1/D1CookingLogRepository";
import type {
  CloudRecipeRepository,
  CreateRecipeRepositoryInput,
  RecipeRepositoryMetadataRepository,
} from "../../repositories/cloudflare-d1/D1RecipeRepository";
import type {
  UserProfile,
  UserProfileRepository,
} from "../../repositories/cloudflare-d1/D1UserProfileRepository";
import type { ClerkAuthenticationOptions } from "../auth/clerk";
import { handleGetCookingLogs, handlePostCookingLog } from "./cookingLogs";
import type { D1Database, WorkerEnv } from "./types";

const env: WorkerEnv = {
  DB: {} as D1Database,
  CLERK_AUTHORIZED_PARTIES: "https://example.test",
  CLERK_JWT_KEY: "test-jwt-key",
};

const validSessionAuth: ClerkAuthenticationOptions = {
  verifyToken: async () =>
    ({
      azp: "https://example.test",
      sid: "sess_test",
      sub: "user_test",
    }) as Awaited<ReturnType<NonNullable<ClerkAuthenticationOptions["verifyToken"]>>>,
};

const userProfile: UserProfile = {
  authProvider: "clerk",
  authSubject: "user_test",
  contributionVisibility: "summary_only",
  createdAt: "2026-07-06T00:00:00.000Z",
  displayName: "Test User",
  id: "profile_test",
  updatedAt: "2026-07-06T00:00:00.000Z",
  username: "test-user",
};

const otherUserProfile: UserProfile = {
  ...userProfile,
  displayName: "Other User",
  id: "profile_other",
  username: "other-user",
};

const publicRepository: CloudRecipeRepository = {
  createdAt: "2026-07-06T00:00:00.000Z",
  id: "repo_public",
  maintainer: "test-user",
  name: "Public Curry",
  ownerHandle: "test-user",
  ownerUserId: "profile_test",
  servings: 4,
  slug: "public-curry",
  tags: [],
  updatedAt: "2026-07-06T00:00:00.000Z",
  version: "1.2.3",
  visibility: "public",
};

const privateRepository: CloudRecipeRepository = {
  ...publicRepository,
  id: "repo_private",
  name: "Private Curry",
  slug: "private-curry",
  visibility: "private",
};

async function parseJson(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("cooking log API handlers", () => {
  it("lists visible cooking logs for a public repository without requiring login", async () => {
    const response = await handleGetCookingLogs(
      new Request("https://example.test/api/repos/test-user/public-curry/cooking-logs"),
      "test-user",
      "public-curry",
      env,
      {
        cookingLogs: createCookingLogRepository([
          {
            authorHandle: "public-cook",
            cookedAt: "2026-07-06T04:00:00.000Z",
            createdAt: "2026-07-06T04:01:00.000Z",
            id: "cook_public",
            recipeVersion: "1.2.3",
            repositoryId: "repo_public",
            result: "cooked",
            userId: "profile_public",
          },
        ]),
        recipeRepositories: createRecipeRepository([publicRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      cookingLogs: [
        expect.objectContaining({
          authorHandle: "public-cook",
          id: "cook_public",
          result: "cooked",
        }),
      ],
      repository: expect.objectContaining({
        id: "repo_public",
        slug: "public-curry",
      }),
    });
    expect(response.status).toBe(200);
  });

  it("hides private repository cooking logs from non-owners", async () => {
    const response = await handleGetCookingLogs(
      new Request("https://example.test/api/repos/test-user/private-curry/cooking-logs", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      "test-user",
      "private-curry",
      env,
      {
        ...validSessionAuth,
        cookingLogs: createCookingLogRepository([]),
        recipeRepositories: createRecipeRepository([privateRepository]),
        userProfiles: createUserProfileRepository([otherUserProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Repository not found.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("allows the owner to list private repository cooking logs with a Clerk cookie", async () => {
    const response = await handleGetCookingLogs(
      new Request("https://example.test/api/repos/test-user/private-curry/cooking-logs", {
        headers: {
          cookie: "__session=fake-session",
        },
      }),
      "test-user",
      "private-curry",
      env,
      {
        ...validSessionAuth,
        cookingLogs: createCookingLogRepository([
          {
            authorDisplayName: "Test User",
            authorHandle: "test-user",
            cookedAt: "2026-07-06T04:00:00.000Z",
            createdAt: "2026-07-06T04:01:00.000Z",
            id: "cook_private",
            recipeVersion: "1.2.3",
            repositoryId: "repo_private",
            result: "cooked",
            userId: "profile_test",
          },
        ]),
        recipeRepositories: createRecipeRepository([privateRepository]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      cookingLogs: [
        expect.objectContaining({
          id: "cook_private",
          repositoryId: "repo_private",
        }),
      ],
      repository: expect.objectContaining({
        id: "repo_private",
        visibility: "private",
      }),
    });
    expect(response.status).toBe(200);
  });

  it("returns a JSON error when optional profile lookup fails during a signed-in read", async () => {
    const response = await handleGetCookingLogs(
      new Request("https://example.test/api/repos/test-user/public-curry/cooking-logs", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      "test-user",
      "public-curry",
      env,
      {
        ...validSessionAuth,
        cookingLogs: createCookingLogRepository([]),
        recipeRepositories: createRecipeRepository([publicRepository]),
        userProfiles: {
          ...createUserProfileRepository([]),
          async findByAuthSubject() {
            throw new Error("D1 unavailable");
          },
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to load profile.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns a JSON error when cooking log listing fails", async () => {
    const response = await handleGetCookingLogs(
      new Request("https://example.test/api/repos/test-user/public-curry/cooking-logs"),
      "test-user",
      "public-curry",
      env,
      {
        cookingLogs: {
          ...createCookingLogRepository([]),
          async listVisibleForRepository() {
            throw new Error("D1 unavailable");
          },
        },
        recipeRepositories: createRecipeRepository([publicRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to load cooking logs.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("creates a cooking log and contribution event for a readable repository", async () => {
    const cookingLogs = createCookingLogRepository([]);
    const response = await handlePostCookingLog(
      new Request("https://example.test/api/repos/test-user/public-curry/cooking-logs", {
        body: JSON.stringify({
          cookedAt: "2026-07-06T04:05:06.000Z",
          notes: "Deployed to table.",
          result: "cooked",
        }),
        method: "POST",
      }),
      "test-user",
      "public-curry",
      userProfile,
      env,
      {
        cookingLogs,
        createContributionEventId: () => "contribution_cook",
        createCookingLogId: () => "cook_new",
        now: () => new Date("2026-07-06T05:06:07.000Z"),
        recipeRepositories: createRecipeRepository([publicRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      contributionEvent: {
        contributionCount: 1,
        eventType: "cooking_logged",
        id: "contribution_cook",
        metadata: {
          cookingLogId: "cook_new",
          recipeVersion: "1.2.3",
          repositoryName: "Public Curry",
          repositoryOwnerHandle: "test-user",
          repositorySlug: "public-curry",
          result: "cooked",
        },
        occurredAt: "2026-07-06T04:05:06.000Z",
        occurredOn: "2026-07-06",
        repositoryId: "repo_public",
        userId: "profile_test",
        visibility: "summary_only",
      },
      cookingLog: {
        authorDisplayName: "Test User",
        authorHandle: "test-user",
        cookedAt: "2026-07-06T04:05:06.000Z",
        createdAt: "2026-07-06T05:06:07.000Z",
        id: "cook_new",
        notes: "Deployed to table.",
        recipeVersion: "1.2.3",
        repositoryId: "repo_public",
        result: "cooked",
        userId: "profile_test",
      },
      repository: expect.objectContaining({
        id: "repo_public",
        slug: "public-curry",
      }),
    });
    expect(response.status).toBe(201);
    await expect(
      cookingLogs.listVisibleForRepository({ repositoryId: "repo_public" }),
    ).resolves.toHaveLength(1);
  });

  it("uses the request time when cookedAt is omitted", async () => {
    const response = await handlePostCookingLog(
      new Request("https://example.test/api/repos/test-user/public-curry/cooking-logs", {
        body: JSON.stringify({ result: "cooked" }),
        method: "POST",
      }),
      "test-user",
      "public-curry",
      userProfile,
      env,
      {
        cookingLogs: createCookingLogRepository([]),
        createContributionEventId: () => "contribution_default_time",
        createCookingLogId: () => "cook_default_time",
        now: () => new Date("2026-07-06T05:06:07.000Z"),
        recipeRepositories: createRecipeRepository([publicRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      contributionEvent: expect.objectContaining({
        occurredAt: "2026-07-06T05:06:07.000Z",
        occurredOn: "2026-07-06",
      }),
      cookingLog: expect.objectContaining({
        cookedAt: "2026-07-06T05:06:07.000Z",
        id: "cook_default_time",
      }),
      repository: expect.objectContaining({
        id: "repo_public",
      }),
    });
    expect(response.status).toBe(201);
  });

  it("rejects invalid cooking log input", async () => {
    const cases: [unknown, string][] = [
      [null, "Request body must be a JSON object."],
      [
        { cookedAt: "tomorrow-ish", result: "cooked" },
        "Cooked at must be a valid date-time string.",
      ],
      [{ cookedAt: 123, result: "cooked" }, "Cooked at must be a valid date-time string."],
      [{ result: "" }, "Result must be 1-80 characters."],
      [{ notes: 123, result: "cooked" }, "Notes must be 2000 characters or fewer."],
    ];

    for (const [body, message] of cases) {
      const response = await handlePostCookingLog(
        new Request("https://example.test/api/repos/test-user/public-curry/cooking-logs", {
          body: JSON.stringify(body),
          method: "POST",
        }),
        "test-user",
        "public-curry",
        userProfile,
        env,
        {
          cookingLogs: createCookingLogRepository([]),
          recipeRepositories: createRecipeRepository([publicRepository]),
        },
      );

      await expect(parseJson(response)).resolves.toEqual({
        error: {
          code: "validation_failed",
          message,
        },
      });
      expect(response.status).toBe(400);
    }
  });

  it("returns a JSON error when repository lookup fails before creating a cooking log", async () => {
    const response = await handlePostCookingLog(
      new Request("https://example.test/api/repos/test-user/public-curry/cooking-logs", {
        body: JSON.stringify({ result: "cooked" }),
        method: "POST",
      }),
      "test-user",
      "public-curry",
      userProfile,
      env,
      {
        cookingLogs: createCookingLogRepository([]),
        recipeRepositories: {
          ...createRecipeRepository([]),
          async findByOwnerAndSlug() {
            throw new Error("D1 unavailable");
          },
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to create cooking log.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns not found when creating a cooking log for a missing repository", async () => {
    const response = await handlePostCookingLog(
      new Request("https://example.test/api/repos/test-user/missing-curry/cooking-logs", {
        body: JSON.stringify({ result: "cooked" }),
        method: "POST",
      }),
      "test-user",
      "missing-curry",
      userProfile,
      env,
      {
        cookingLogs: createCookingLogRepository([]),
        recipeRepositories: createRecipeRepository([]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Repository not found.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("returns a JSON error when the write repository fails", async () => {
    const response = await handlePostCookingLog(
      new Request("https://example.test/api/repos/test-user/public-curry/cooking-logs", {
        body: JSON.stringify({ result: "cooked" }),
        method: "POST",
      }),
      "test-user",
      "public-curry",
      userProfile,
      env,
      {
        cookingLogs: {
          ...createCookingLogRepository([]),
          async createWithContribution() {
            throw new Error("D1 unavailable");
          },
        },
        recipeRepositories: createRecipeRepository([publicRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to create cooking log.",
      },
    });
    expect(response.status).toBe(500);
  });
});

function createUserProfileRepository(initialProfiles: UserProfile[]): UserProfileRepository {
  const profiles = [...initialProfiles];

  return {
    async create(input) {
      const profile: UserProfile = {
        authProvider: input.authProvider,
        authSubject: input.authSubject,
        avatarUrl: input.avatarUrl,
        contributionVisibility: input.contributionVisibility ?? "summary_only",
        createdAt: input.now,
        displayName: input.displayName,
        id: input.id,
        updatedAt: input.now,
        username: input.username,
      };
      profiles.push(profile);
      return profile;
    },
    async findByAuthSubject(authProvider, authSubject) {
      return (
        profiles.find(
          (profile) => profile.authProvider === authProvider && profile.authSubject === authSubject,
        ) ?? null
      );
    },
    async findByUsername(username) {
      return profiles.find((profile) => profile.username === username) ?? null;
    },
  };
}

function createRecipeRepository(
  initialRepositories: CloudRecipeRepository[],
): RecipeRepositoryMetadataRepository {
  const repositories = [...initialRepositories];

  function buildRepository(input: CreateRecipeRepositoryInput): CloudRecipeRepository {
    return {
      createdAt: input.now,
      description: input.description,
      id: input.id,
      license: input.license,
      maintainer: input.ownerHandle,
      name: input.name,
      ownerHandle: input.ownerHandle,
      ownerUserId: input.ownerUserId,
      readme: input.readme,
      servings: input.servings ?? 2,
      slug: input.slug,
      sourceRepositoryId: input.sourceRepositoryId,
      tags: [],
      updatedAt: input.now,
      version: input.version ?? "0.1.0",
      visibility: input.visibility ?? "public",
    };
  }

  return {
    async create(input: CreateRecipeRepositoryInput) {
      const repository = buildRepository(input);
      repositories.push(repository);
      return repository;
    },
    async createWithContribution(input) {
      const repository = buildRepository(input);
      repositories.push(repository);
      return {
        contributionEvent: {
          contributionCount: 1,
          eventType: input.contribution.eventType,
          id: input.contribution.id,
          metadata: input.contribution.metadata,
          occurredAt: input.contribution.occurredAt,
          occurredOn: input.contribution.occurredOn,
          repositoryId: input.id,
          userId: input.ownerUserId,
          visibility: input.contribution.visibility,
        },
        repository,
      };
    },
    async delete(id) {
      const index = repositories.findIndex((repository) => repository.id === id);
      if (index >= 0) {
        repositories.splice(index, 1);
      }
    },
    async findByOwnerAndSlug(ownerHandle, slug) {
      return (
        repositories.find(
          (repository) => repository.ownerHandle === ownerHandle && repository.slug === slug,
        ) ?? null
      );
    },
    async listPublic() {
      return repositories.filter((repository) => repository.visibility === "public");
    },
    async update(input) {
      const repository: CloudRecipeRepository = {
        createdAt: input.createdAt,
        description: input.description,
        id: input.id,
        license: input.license,
        maintainer: input.ownerHandle,
        name: input.name,
        ownerHandle: input.ownerHandle,
        ownerUserId: input.ownerUserId,
        readme: input.readme,
        servings: input.servings,
        slug: input.slug,
        sourceRepositoryId: input.sourceRepositoryId,
        tags: [],
        updatedAt: input.now,
        version: input.version,
        visibility: input.visibility,
      };
      const index = repositories.findIndex((item) => item.id === input.id);
      if (index >= 0) {
        repositories[index] = repository;
      }
      return repository;
    },
    async updateWithContribution(input) {
      const repository: CloudRecipeRepository = {
        createdAt: input.createdAt,
        description: input.description,
        id: input.id,
        license: input.license,
        maintainer: input.ownerHandle,
        name: input.name,
        ownerHandle: input.ownerHandle,
        ownerUserId: input.ownerUserId,
        readme: input.readme,
        servings: input.servings,
        slug: input.slug,
        sourceRepositoryId: input.sourceRepositoryId,
        tags: [],
        updatedAt: input.now,
        version: input.version,
        visibility: input.visibility,
      };
      const index = repositories.findIndex((item) => item.id === input.id);
      if (index >= 0) {
        repositories[index] = repository;
      }
      return {
        contributionEvent: {
          contributionCount: 1,
          eventType: input.contribution.eventType,
          id: input.contribution.id,
          metadata: input.contribution.metadata,
          occurredAt: input.contribution.occurredAt,
          occurredOn: input.contribution.occurredOn,
          repositoryId: input.id,
          userId: input.ownerUserId,
          visibility: input.contribution.visibility,
        },
        repository,
      };
    },
  };
}

function createCookingLogRepository(initialLogs: CloudCookingLog[]): CookingLogRepository {
  const logs = [...initialLogs];

  return {
    async createWithContribution(input: CreateCookingLogWithContributionInput) {
      const cookingLog: CloudCookingLog = {
        authorDisplayName: input.authorDisplayName,
        authorHandle: input.authorHandle,
        cookedAt: input.cookedAt,
        createdAt: input.now,
        id: input.cookingLogId,
        notes: input.notes,
        recipeVersion: input.recipeVersion,
        repositoryId: input.repositoryId,
        result: input.result,
        userId: input.userId,
      };
      const contributionEvent: CloudContributionEvent = {
        contributionCount: 1,
        eventType: "cooking_logged",
        id: input.contributionEventId,
        metadata: {
          cookingLogId: input.cookingLogId,
          recipeVersion: input.recipeVersion,
          repositoryName: input.repositoryName,
          repositoryOwnerHandle: input.repositoryOwnerHandle,
          repositorySlug: input.repositorySlug,
          result: input.result,
        },
        occurredAt: input.cookedAt,
        occurredOn: input.occurredOn,
        repositoryId: input.repositoryId,
        userId: input.userId,
        visibility: input.contributionVisibility,
      };
      logs.push(cookingLog);
      return { contributionEvent, cookingLog };
    },
    async listVisibleForRepository(input) {
      return logs.filter((log) => log.repositoryId === input.repositoryId);
    },
  };
}
