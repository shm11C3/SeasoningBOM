import { describe, expect, it } from "vitest";
import type {
  CloudContributionEvent,
  CloudCookingLog,
  CookingLogRepository,
  CreateCookingLogWithContributionInput,
} from "../../repositories/cloudflare-d1/D1CookingLogRepository";
import type {
  CloudInventoryItem,
  CreateInventoryItemInput,
  InventoryItemRepository,
  UpdateInventoryItemInput,
} from "../../repositories/cloudflare-d1/D1InventoryRepository";
import type { RecipeComponentWriteRepository } from "../../repositories/cloudflare-d1/D1RecipeComponentRepository";
import type {
  CloudRecipeRepository,
  CreateRecipeRepositoryInput,
  RecipeRepositoryMetadataRepository,
} from "../../repositories/cloudflare-d1/D1RecipeRepository";
import type { RepositoryStarRepository } from "../../repositories/cloudflare-d1/D1RepositoryStarRepository";
import type {
  UserProfile,
  UserProfileRepository,
} from "../../repositories/cloudflare-d1/D1UserProfileRepository";
import type { ClerkAuthenticationOptions } from "../auth/clerk";
import worker from "./index";
import { handleApiRequest } from "./router";
import type { D1Database, WorkerEnv } from "./types";

const env: WorkerEnv = {
  DB: {} as D1Database,
};

const configuredEnv: WorkerEnv = {
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
  authSubject: "user_test",
  displayName: "Other User",
  id: "profile_other",
  username: "other-user",
};

const publicRecipeRepository: CloudRecipeRepository = {
  createdAt: "2026-07-06T00:00:00.000Z",
  id: "repo_public",
  maintainer: "test-user",
  name: "Public Curry",
  ownerHandle: "test-user",
  ownerUserId: "profile_test",
  readme: "# Public Curry",
  servings: 4,
  slug: "public-curry",
  tags: [],
  updatedAt: "2026-07-06T00:00:00.000Z",
  version: "1.0.0",
  visibility: "public",
};

const unlistedRecipeRepository: CloudRecipeRepository = {
  ...publicRecipeRepository,
  id: "repo_unlisted",
  name: "Unlisted Curry",
  slug: "unlisted-curry",
  visibility: "unlisted",
};

const privateRecipeRepository: CloudRecipeRepository = {
  ...publicRecipeRepository,
  id: "repo_private",
  name: "Private Curry",
  slug: "private-curry",
  visibility: "private",
};

const inventoryItem: CloudInventoryItem = {
  bestBeforeDate: "2026-07-10",
  category: "grain",
  createdAt: "2026-07-06T00:00:00.000Z",
  hazardous: false,
  id: "inventory_rice",
  name: "Rice",
  quantity: 2,
  unit: "go",
  updatedAt: "2026-07-06T00:00:00.000Z",
  userId: "profile_test",
};

const recipeComponent = {
  allergens: ["wheat"],
  alternatives: ["homemade roux"],
  dependencyType: "required",
  id: "component_roux",
  ingredientName: "curry-roux",
  quantity: 1,
  recipeId: "repo_public",
  required: true,
  transitiveDependencies: [
    {
      allergens: ["milk"],
      dependencyType: "transitive",
      name: "milk powder",
      notes: "Often hidden in roux blocks.",
    },
  ],
  unit: "box",
} satisfies Awaited<ReturnType<RecipeComponentWriteRepository["listByRepositoryId"]>>[number];

const cookingLog: CloudCookingLog = {
  authorHandle: "public-cook",
  cookedAt: "2026-07-06T04:05:06.000Z",
  createdAt: "2026-07-06T05:06:07.000Z",
  id: "cook_public",
  recipeVersion: "1.0.0",
  repositoryId: "repo_public",
  result: "cooked",
  userId: "profile_other",
};

async function parseJson(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("Worker API router", () => {
  it("returns the health response through the Worker fetch entrypoint", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/health"), env);

    await expect(parseJson(response)).resolves.toEqual({
      ok: true,
      service: "SeasoningBOM",
      persistence: "d1",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("allows HEAD health checks without a JSON body", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/health", { method: "HEAD" }),
      env,
    );

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });

  it("keeps trailing slashes equivalent for API routes", async () => {
    const response = await handleApiRequest(new Request("https://example.test/api/health/"), env);

    await expect(parseJson(response)).resolves.toEqual({
      ok: true,
      service: "SeasoningBOM",
      persistence: "d1",
    });
    expect(response.status).toBe(200);
  });

  it("rejects unsupported methods with an Allow header", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/health", { method: "POST" }),
      env,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "method_not_allowed",
        message: "This HTTP method is not allowed.",
      },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });

  it("returns 404 JSON for unknown API routes", async () => {
    const response = await handleApiRequest(new Request("https://example.test/api/nope"), env);

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "No API route matches /api/nope.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("does not treat protected routes as authenticated without a Clerk bearer token", async () => {
    const response = await handleApiRequest(new Request("https://example.test/api/me"), env);

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_authenticated",
        message: "Sign in with Clerk to access this endpoint.",
      },
    });
    expect(response.status).toBe(401);
  });

  it("fails closed when Clerk auth is not configured", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/me", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      env,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "auth_misconfigured",
        message: "Authentication is not configured.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns the authenticated user profile", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/me", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      profile: {
        contributionVisibility: "summary_only",
        createdAt: "2026-07-06T00:00:00.000Z",
        displayName: "Test User",
        id: "profile_test",
        updatedAt: "2026-07-06T00:00:00.000Z",
        username: "test-user",
      },
    });
    expect(response.status).toBe(200);
  });

  it("rejects unsupported methods for /api/me", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/me", {
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "method_not_allowed",
        message: "This HTTP method is not allowed.",
      },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("returns a bootstrap hint when the authenticated user has no profile", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/me", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        userProfiles: createUserProfileRepository([]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "profile_not_initialized",
        message: "Create a profile before accessing this endpoint.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("keeps profile bootstrap behind POST and a valid Clerk session", async () => {
    const userProfiles = createUserProfileRepository([]);
    const getResponse = await handleApiRequest(
      new Request("https://example.test/api/me/profile", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        userProfiles,
      },
    );
    const postResponse = await handleApiRequest(
      new Request("https://example.test/api/me/profile", {
        body: JSON.stringify({
          displayName: "New User",
          username: "New-User",
        }),
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        createProfileId: () => "profile_new",
        now: () => new Date("2026-07-06T01:02:03.000Z"),
        userProfiles,
      },
    );

    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get("allow")).toBe("POST");
    expect(postResponse.status).toBe(201);
    await expect(parseJson(postResponse)).resolves.toEqual({
      profile: {
        contributionVisibility: "summary_only",
        createdAt: "2026-07-06T01:02:03.000Z",
        displayName: "New User",
        id: "profile_new",
        updatedAt: "2026-07-06T01:02:03.000Z",
        username: "new-user",
      },
    });
  });

  it("requires bearer auth for profile bootstrap", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/me/profile", {
        body: JSON.stringify({ username: "new-user" }),
        headers: {
          cookie: "__session=fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        userProfiles: createUserProfileRepository([]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_authenticated",
        message: "Sign in with Clerk to access this endpoint.",
      },
    });
    expect(response.status).toBe(401);
  });

  it("lists public repositories without requiring login", async () => {
    const response = await handleApiRequest(new Request("https://example.test/api/repos"), env, {
      recipeRepositories: createRecipeRepository([
        publicRecipeRepository,
        unlistedRecipeRepository,
        privateRecipeRepository,
      ]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      repositories: [
        expect.objectContaining({
          id: "repo_public",
          ownerHandle: "test-user",
          slug: "public-curry",
          visibility: "public",
        }),
      ],
    });
    expect(response.status).toBe(200);
  });

  it("fetches public and unlisted repositories without requiring login", async () => {
    const recipeRepositories = createRecipeRepository([
      publicRecipeRepository,
      unlistedRecipeRepository,
    ]);
    const publicResponse = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry"),
      env,
      { recipeRepositories },
    );
    const unlistedResponse = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/unlisted-curry"),
      env,
      { recipeRepositories },
    );

    await expect(parseJson(publicResponse)).resolves.toEqual({
      repository: expect.objectContaining({
        id: "repo_public",
        ownerHandle: "test-user",
        slug: "public-curry",
        visibility: "public",
      }),
    });
    await expect(parseJson(unlistedResponse)).resolves.toEqual({
      repository: expect.objectContaining({
        id: "repo_unlisted",
        ownerHandle: "test-user",
        slug: "unlisted-curry",
        visibility: "unlisted",
      }),
    });
    expect(publicResponse.status).toBe(200);
    expect(unlistedResponse.status).toBe(200);
  });

  it("hides private repositories from unauthenticated visitors", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/private-curry"),
      env,
      {
        recipeRepositories: createRecipeRepository([privateRecipeRepository]),
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

  it("hides private repositories from signed-in non-owners", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/private-curry", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeRepositories: createRecipeRepository([privateRecipeRepository]),
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

  it("allows the owner to fetch a private repository", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/private-curry", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeRepositories: createRecipeRepository([privateRecipeRepository]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      repository: expect.objectContaining({
        id: "repo_private",
        ownerHandle: "test-user",
        slug: "private-curry",
        visibility: "private",
      }),
    });
    expect(response.status).toBe(200);
  });

  it("does not treat HEAD as a repository collection read", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos", { method: "HEAD" }),
      env,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST");
    await expect(response.text()).resolves.toBe("");
  });

  it("returns repository dependencies through the concrete Hono route", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/dependencies"),
      env,
      {
        recipeComponents: createRecipeComponentRepository([recipeComponent]),
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      components: [
        expect.objectContaining({
          id: "component_roux",
          ingredientName: "curry-roux",
          transitiveDependencies: [
            expect.objectContaining({
              name: "milk powder",
            }),
          ],
        }),
      ],
      repository: expect.objectContaining({
        id: "repo_public",
        slug: "public-curry",
      }),
    });
    expect(response.status).toBe(200);
  });

  it("returns SeasoningBOM through the concrete Hono route", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/bom"),
      env,
      {
        now: () => new Date("2026-07-06T02:03:04.000Z"),
        recipeComponents: createRecipeComponentRepository([recipeComponent]),
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      audit: {
        issues: [
          expect.objectContaining({ category: "allergen" }),
          expect.objectContaining({ category: "transitive-dependency" }),
        ],
      },
      bomFormat: "SeasoningBOM",
      components: [expect.objectContaining({ name: "curry-roux" })],
      generatedAt: "2026-07-06T02:03:04.000Z",
      repository: expect.objectContaining({
        owner: "test-user",
        visibility: "public",
      }),
      specVersion: "0.1.0",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="public-curry-seasoningbom.json"',
    );
  });

  it("returns repository security alerts through the concrete Hono route", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/security"),
      env,
      {
        now: () => new Date("2026-07-06T02:03:04.000Z"),
        recipeComponents: createRecipeComponentRepository([recipeComponent]),
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      generatedAt: "2026-07-06T02:03:04.000Z",
      recipeAlerts: [
        expect.objectContaining({ category: "allergen" }),
        expect.objectContaining({ category: "transitive-dependency" }),
      ],
      repository: expect.objectContaining({ id: "repo_public" }),
      summary: {
        critical: 0,
        high: 0,
        low: 0,
        medium: 2,
        totalIssues: 2,
      },
    });
    expect(response.status).toBe(200);
  });

  it("runs inventory audit through the authenticated concrete Hono route", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/audit", {
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        inventoryItems: createInventoryRepository([inventoryItem]),
        now: () => new Date("2026-07-06T02:03:04.000Z"),
        recipeComponents: createRecipeComponentRepository([recipeComponent]),
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      inventoryAudit: {
        generatedAt: "2026-07-06T02:03:04.000Z",
        issues: [
          expect.objectContaining({
            category: "missing",
            componentName: "curry-roux",
          }),
        ],
        recipeId: "repo_public",
        summary: {
          critical: 0,
          high: 1,
          low: 0,
          medium: 0,
          totalIssues: 1,
        },
      },
      repository: expect.objectContaining({ id: "repo_public" }),
    });
    expect(response.status).toBe(200);
  });

  it("requires bearer auth for repository audit", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/audit", {
        headers: {
          cookie: "__session=fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        inventoryItems: createInventoryRepository([inventoryItem]),
        recipeComponents: createRecipeComponentRepository([recipeComponent]),
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_authenticated",
        message: "Sign in with Clerk to access this endpoint.",
      },
    });
    expect(response.status).toBe(401);
  });

  it("rejects unsupported repository BOM, security, and audit methods", async () => {
    const bomResponse = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/bom", {
        method: "POST",
      }),
      env,
    );
    const securityResponse = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/security", {
        method: "POST",
      }),
      env,
    );
    const auditResponse = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/audit"),
      env,
    );

    expect(bomResponse.status).toBe(405);
    expect(bomResponse.headers.get("allow")).toBe("GET");
    expect(securityResponse.status).toBe(405);
    expect(securityResponse.headers.get("allow")).toBe("GET");
    expect(auditResponse.status).toBe(405);
    expect(auditResponse.headers.get("allow")).toBe("POST");
  });

  it("replaces repository dependencies through the concrete Hono route", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/dependencies", {
        body: JSON.stringify({
          components: [
            {
              dependencyType: "required",
              id: "component_rice",
              ingredientName: "rice",
              quantity: 2,
              transitiveDependencies: [
                {
                  allergens: [],
                  dependencyType: "peer",
                  name: "water",
                },
              ],
              unit: "go",
            },
          ],
        }),
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "PUT",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeComponents: createRecipeComponentRepository([]),
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      components: [
        expect.objectContaining({
          id: "component_rice",
          ingredientName: "rice",
          transitiveDependencies: [expect.objectContaining({ name: "water" })],
        }),
      ],
      repository: expect.objectContaining({ id: "repo_public" }),
    });
    expect(response.status).toBe(200);
  });

  it("requires bearer auth for dependency replacement", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/dependencies", {
        body: JSON.stringify({ components: [] }),
        method: "PUT",
      }),
      env,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_authenticated",
        message: "Sign in with Clerk to access this endpoint.",
      },
    });
    expect(response.status).toBe(401);
  });

  it("rejects Clerk cookies for dependency replacement", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/dependencies", {
        body: JSON.stringify({ components: [] }),
        headers: {
          cookie: "__session=fake-session",
        },
        method: "PUT",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeComponents: createRecipeComponentRepository([]),
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_authenticated",
        message: "Sign in with Clerk to access this endpoint.",
      },
    });
    expect(response.status).toBe(401);
  });

  it("rejects unsupported dependency methods with an Allow header", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/dependencies", {
        method: "POST",
      }),
      env,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "method_not_allowed",
        message: "This HTTP method is not allowed.",
      },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, PUT");
  });

  it("returns repository cooking logs through the concrete Hono route", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/cooking-logs"),
      env,
      {
        cookingLogs: createCookingLogRepository([cookingLog]),
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
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

  it("creates cooking logs through the authenticated concrete Hono route", async () => {
    const cookingLogs = createCookingLogRepository([]);
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/cooking-logs", {
        body: JSON.stringify({
          cookedAt: "2026-07-06T04:05:06.000Z",
          result: "cooked",
        }),
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        cookingLogs,
        createContributionEventId: () => "contribution_cook",
        createCookingLogId: () => "cook_new",
        now: () => new Date("2026-07-06T05:06:07.000Z"),
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      contributionEvent: expect.objectContaining({
        eventType: "cooking_logged",
        id: "contribution_cook",
        occurredOn: "2026-07-06",
      }),
      cookingLog: expect.objectContaining({
        authorHandle: "test-user",
        id: "cook_new",
        result: "cooked",
      }),
      repository: expect.objectContaining({
        id: "repo_public",
      }),
    });
    expect(response.status).toBe(201);
    await expect(
      cookingLogs.listVisibleForRepository({ repositoryId: "repo_public" }),
    ).resolves.toHaveLength(1);
  });

  it("requires bearer auth for cooking log mutations", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/cooking-logs", {
        body: JSON.stringify({ result: "cooked" }),
        headers: {
          cookie: "__session=fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        cookingLogs: createCookingLogRepository([]),
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_authenticated",
        message: "Sign in with Clerk to access this endpoint.",
      },
    });
    expect(response.status).toBe(401);
  });

  it("rejects unsupported cooking log methods with an Allow header", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/cooking-logs", {
        method: "DELETE",
      }),
      env,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "method_not_allowed",
        message: "This HTTP method is not allowed.",
      },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST");
  });

  it("stars and unstars repositories through the concrete Hono route", async () => {
    const repositoryStars = createRepositoryStarRepository();
    const recipeRepositories = createRecipeRepository([publicRecipeRepository]);
    const starResponse = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/star", {
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeRepositories,
        repositoryStars,
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );
    const unstarResponse = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/star", {
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "DELETE",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeRepositories,
        repositoryStars,
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(starResponse)).resolves.toEqual({
      repository: expect.objectContaining({
        id: "repo_public",
        slug: "public-curry",
      }),
      starred: true,
    });
    expect(starResponse.status).toBe(201);
    expect(unstarResponse.status).toBe(204);
    expect(repositoryStars.hasStar({ repositoryId: "repo_public", userId: "profile_test" })).toBe(
      false,
    );
  });

  it("requires bearer auth for repository star mutations", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/star", {
        headers: {
          cookie: "__session=fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_authenticated",
        message: "Sign in with Clerk to access this endpoint.",
      },
    });
    expect(response.status).toBe(401);
  });

  it("requires bearer auth for repository unstar and fork mutations", async () => {
    const unstarResponse = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/star", {
        headers: {
          cookie: "__session=fake-session",
        },
        method: "DELETE",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );
    const forkResponse = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/fork", {
        headers: {
          cookie: "__session=fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(unstarResponse)).resolves.toEqual({
      error: {
        code: "not_authenticated",
        message: "Sign in with Clerk to access this endpoint.",
      },
    });
    await expect(parseJson(forkResponse)).resolves.toEqual({
      error: {
        code: "not_authenticated",
        message: "Sign in with Clerk to access this endpoint.",
      },
    });
    expect(unstarResponse.status).toBe(401);
    expect(forkResponse.status).toBe(401);
  });

  it("forks repositories through the concrete Hono route", async () => {
    const sourceRepository = {
      ...publicRecipeRepository,
      ownerHandle: "source-user",
      ownerUserId: "profile_source",
    } satisfies CloudRecipeRepository;
    const recipeRepositories = createRecipeRepository([sourceRepository]);
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/source-user/public-curry/fork", {
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        createRepositoryId: () => "repo_fork",
        now: () => new Date("2026-07-06T02:03:04.000Z"),
        recipeRepositories,
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      repository: expect.objectContaining({
        id: "repo_fork",
        ownerHandle: "test-user",
        slug: "public-curry",
        sourceRepositoryId: "repo_public",
      }),
    });
    expect(response.status).toBe(201);
  });

  it("rejects unsupported star and fork methods with Allow headers", async () => {
    const starResponse = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/star"),
      env,
    );
    const forkResponse = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/fork"),
      env,
    );

    await expect(parseJson(starResponse)).resolves.toEqual({
      error: {
        code: "method_not_allowed",
        message: "This HTTP method is not allowed.",
      },
    });
    await expect(parseJson(forkResponse)).resolves.toEqual({
      error: {
        code: "method_not_allowed",
        message: "This HTTP method is not allowed.",
      },
    });
    expect(starResponse.status).toBe(405);
    expect(starResponse.headers.get("allow")).toBe("POST, DELETE");
    expect(forkResponse.status).toBe(405);
    expect(forkResponse.headers.get("allow")).toBe("POST");
  });

  it("does not treat HEAD as a repository star or fork mutation", async () => {
    const starResponse = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/star", {
        method: "HEAD",
      }),
      env,
    );
    const forkResponse = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry/fork", {
        method: "HEAD",
      }),
      env,
    );

    expect(starResponse.status).toBe(405);
    expect(starResponse.headers.get("allow")).toBe("POST, DELETE");
    await expect(starResponse.text()).resolves.toBe("");
    expect(forkResponse.status).toBe(405);
    expect(forkResponse.headers.get("allow")).toBe("POST");
    await expect(forkResponse.text()).resolves.toBe("");
  });

  it("returns not found for malformed repository star path parameters", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/%E0%A4%A/public-curry/star", {
        method: "POST",
      }),
      env,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "No API route matches /api/repos/%E0%A4%A/public-curry/star.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("creates repository metadata for the authenticated owner", async () => {
    const recipeRepositories = createRecipeRepository([]);
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos", {
        body: JSON.stringify({
          name: "Curry Rice",
          slug: "Curry-Rice",
          visibility: "unlisted",
          version: "1.2.3",
          servings: 4,
          readme: "# Curry Rice",
        }),
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        createRepositoryId: () => "repo_new",
        now: () => new Date("2026-07-06T01:02:03.000Z"),
        recipeRepositories,
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      repository: {
        createdAt: "2026-07-06T01:02:03.000Z",
        id: "repo_new",
        maintainer: "test-user",
        name: "Curry Rice",
        ownerHandle: "test-user",
        readme: "# Curry Rice",
        servings: 4,
        slug: "curry-rice",
        tags: [],
        updatedAt: "2026-07-06T01:02:03.000Z",
        version: "1.2.3",
        visibility: "unlisted",
      },
    });
    expect(response.status).toBe(201);
    await expect(recipeRepositories.findByOwnerAndSlug("test-user", "curry-rice")).resolves.toEqual(
      expect.objectContaining({
        id: "repo_new",
      }),
    );
  });

  it("rejects duplicate repository slugs for the same owner", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos", {
        body: JSON.stringify({
          name: "Duplicate Curry",
          slug: "public-curry",
        }),
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "repository_already_exists",
        message: "A repository with this owner and slug already exists.",
      },
    });
    expect(response.status).toBe(409);
  });

  it("updates repository metadata for the owner", async () => {
    const recipeRepositories = createRecipeRepository([publicRecipeRepository]);
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry", {
        body: JSON.stringify({
          name: "Renamed Curry",
          slug: "renamed-curry",
          visibility: "private",
        }),
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "PATCH",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        now: () => new Date("2026-07-06T02:03:04.000Z"),
        recipeRepositories,
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      repository: expect.objectContaining({
        name: "Renamed Curry",
        ownerHandle: "test-user",
        slug: "renamed-curry",
        updatedAt: "2026-07-06T02:03:04.000Z",
        visibility: "private",
      }),
    });
    expect(response.status).toBe(200);
    await expect(
      recipeRepositories.findByOwnerAndSlug("test-user", "renamed-curry"),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "repo_public",
      }),
    );
  });

  it("hides repository updates from signed-in non-owners", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry", {
        body: JSON.stringify({ name: "Nope" }),
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "PATCH",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeRepositories: createRecipeRepository([publicRecipeRepository]),
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

  it("deletes repository metadata for the owner", async () => {
    const recipeRepositories = createRecipeRepository([publicRecipeRepository]);
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos/test-user/public-curry", {
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "DELETE",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeRepositories,
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
    await expect(
      recipeRepositories.findByOwnerAndSlug("test-user", "public-curry"),
    ).resolves.toBeNull();
  });

  it("keeps repository mutation routes authenticated", async () => {
    const unauthenticated = await handleApiRequest(
      new Request("https://example.test/api/repos", { method: "POST" }),
      env,
    );
    const authenticated = await handleApiRequest(
      new Request("https://example.test/api/repos", {
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeRepositories: createRecipeRepository([]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    expect(unauthenticated.status).toBe(401);
    expect(authenticated.status).toBe(400);
    await expect(parseJson(authenticated)).resolves.toEqual({
      error: {
        code: "validation_failed",
        message: "Request body must be valid JSON.",
      },
    });
  });

  it("requires profile bootstrap before planned private routes", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos", {
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeRepositories: createRecipeRepository([]),
        userProfiles: createUserProfileRepository([]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "profile_not_initialized",
        message: "Create a profile before accessing this endpoint.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("requires bearer auth instead of Clerk cookies for mutation routes", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/repos", {
        headers: {
          cookie: "__session=fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        recipeRepositories: createRecipeRepository([]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_authenticated",
        message: "Sign in with Clerk to access this endpoint.",
      },
    });
    expect(response.status).toBe(401);
  });

  it("allows Clerk cookies for protected GET routes", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/me", {
        headers: {
          cookie: "__session=fake-session",
        },
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      profile: {
        contributionVisibility: "summary_only",
        createdAt: "2026-07-06T00:00:00.000Z",
        displayName: "Test User",
        id: "profile_test",
        updatedAt: "2026-07-06T00:00:00.000Z",
        username: "test-user",
      },
    });
    expect(response.status).toBe(200);
  });

  it("keeps private inventory routes authenticated and owner scoped", async () => {
    const unauthenticated = await handleApiRequest(
      new Request("https://example.test/api/inventory"),
      env,
    );
    const authenticated = await handleApiRequest(
      new Request("https://example.test/api/inventory", {
        headers: {
          authorization: "Bearer fake-session",
        },
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        inventoryItems: createInventoryRepository([
          inventoryItem,
          {
            ...inventoryItem,
            id: "inventory_other",
            name: "Other Salt",
            userId: "profile_other",
          },
        ]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    expect(unauthenticated.status).toBe(401);
    await expect(parseJson(authenticated)).resolves.toEqual({
      inventoryItems: [
        expect.objectContaining({
          id: "inventory_rice",
          name: "Rice",
        }),
      ],
    });
    expect(authenticated.status).toBe(200);
  });

  it("requires bearer auth for inventory mutations", async () => {
    const cookieOnly = await handleApiRequest(
      new Request("https://example.test/api/inventory", {
        body: JSON.stringify({
          category: "grain",
          name: "Rice",
          quantity: 2,
          unit: "go",
        }),
        headers: {
          cookie: "__session=fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        inventoryItems: createInventoryRepository([]),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );
    const bearer = await handleApiRequest(
      new Request("https://example.test/api/inventory", {
        body: JSON.stringify({
          category: "grain",
          name: "Rice",
          quantity: 2,
          unit: "go",
        }),
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "POST",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        createInventoryItemId: () => "inventory_new",
        inventoryItems: createInventoryRepository([]),
        now: () => new Date("2026-07-06T01:02:03.000Z"),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    expect(cookieOnly.status).toBe(401);
    await expect(parseJson(bearer)).resolves.toEqual({
      inventoryItem: expect.objectContaining({
        id: "inventory_new",
        name: "Rice",
      }),
    });
    expect(bearer.status).toBe(201);
  });

  it("updates and deletes inventory through authenticated inventory item routes", async () => {
    const inventoryItems = createInventoryRepository([inventoryItem]);
    const updated = await handleApiRequest(
      new Request("https://example.test/api/inventory/inventory_rice", {
        body: JSON.stringify({
          hazardous: true,
          quantity: 3,
        }),
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "PATCH",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        inventoryItems,
        now: () => new Date("2026-07-06T02:03:04.000Z"),
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );
    const deleted = await handleApiRequest(
      new Request("https://example.test/api/inventory/inventory_rice", {
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "DELETE",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        inventoryItems,
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(updated)).resolves.toEqual({
      inventoryItem: expect.objectContaining({
        hazardous: true,
        id: "inventory_rice",
        quantity: 3,
      }),
    });
    expect(updated.status).toBe(200);
    expect(deleted.status).toBe(204);
    await expect(deleted.text()).resolves.toBe("");
    await expect(
      inventoryItems.findByIdForUser(userProfile.id, "inventory_rice"),
    ).resolves.toBeNull();
  });

  it("hides inventory item mutations from non-owners", async () => {
    const inventoryItems = createInventoryRepository([
      {
        ...inventoryItem,
        id: "inventory_other",
        userId: "profile_other",
      },
    ]);
    const patched = await handleApiRequest(
      new Request("https://example.test/api/inventory/inventory_other", {
        body: JSON.stringify({ quantity: 3 }),
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "PATCH",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        inventoryItems,
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );
    const deleted = await handleApiRequest(
      new Request("https://example.test/api/inventory/inventory_other", {
        headers: {
          authorization: "Bearer fake-session",
        },
        method: "DELETE",
      }),
      configuredEnv,
      {
        ...validSessionAuth,
        inventoryItems,
        userProfiles: createUserProfileRepository([userProfile]),
      },
    );

    await expect(parseJson(patched)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Inventory item not found.",
      },
    });
    expect(patched.status).toBe(404);
    await expect(parseJson(deleted)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Inventory item not found.",
      },
    });
    expect(deleted.status).toBe(404);
    await expect(
      inventoryItems.findByIdForUser("profile_other", "inventory_other"),
    ).resolves.toEqual(expect.objectContaining({ quantity: 2 }));
  });

  it("rejects unsupported inventory methods with an Allow header", async () => {
    const collectionHead = await handleApiRequest(
      new Request("https://example.test/api/inventory", { method: "HEAD" }),
      env,
    );
    const itemGet = await handleApiRequest(
      new Request("https://example.test/api/inventory/inventory_rice"),
      env,
    );

    expect(collectionHead.status).toBe(405);
    expect(collectionHead.headers.get("allow")).toBe("GET, POST");
    await expect(collectionHead.text()).resolves.toBe("");
    expect(itemGet.status).toBe(405);
    expect(itemGet.headers.get("allow")).toBe("PATCH, DELETE");
    await expect(parseJson(itemGet)).resolves.toEqual({
      error: {
        code: "method_not_allowed",
        message: "This HTTP method is not allowed.",
      },
    });
  });

  it("recognizes planned public profile routes without implementing them yet", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/users/shoma/profile"),
      env,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_implemented",
        message: "Profile API is not implemented yet.",
      },
    });
    expect(response.status).toBe(501);
  });

  it("matches planned public profile routes with trailing slashes", async () => {
    const response = await handleApiRequest(
      new Request("https://example.test/api/users/shoma/profile/"),
      env,
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_implemented",
        message: "Profile API is not implemented yet.",
      },
    });
    expect(response.status).toBe(501);
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

  return {
    async create(input: CreateRecipeRepositoryInput) {
      const repository: CloudRecipeRepository = {
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
      repositories.push(repository);
      return repository;
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
  };
}

function createRepositoryStarRepository(): RepositoryStarRepository & {
  hasStar(key: { repositoryId: string; userId: string }): boolean;
} {
  const stars = new Set<string>();

  return {
    hasStar(key) {
      return stars.has(repositoryStarKey(key));
    },
    async isStarred(key) {
      return stars.has(repositoryStarKey(key));
    },
    async star(input) {
      stars.add(repositoryStarKey(input));
    },
    async unstar(key) {
      stars.delete(repositoryStarKey(key));
    },
  };
}

function repositoryStarKey(key: { repositoryId: string; userId: string }): string {
  return `${key.userId}:${key.repositoryId}`;
}

function createRecipeComponentRepository(
  initialComponents: Awaited<ReturnType<RecipeComponentWriteRepository["listByRepositoryId"]>>,
): RecipeComponentWriteRepository {
  const components = [...initialComponents];

  return {
    async listByRepositoryId(repositoryId) {
      return components.filter((component) => component.recipeId === repositoryId);
    },
    async replaceByRepositoryId(repositoryId, nextComponents) {
      for (let index = components.length - 1; index >= 0; index -= 1) {
        if (components[index]?.recipeId === repositoryId) {
          components.splice(index, 1);
        }
      }

      const savedComponents = nextComponents.map((component) => ({
        ...component,
        recipeId: repositoryId,
      }));
      components.push(...savedComponents);
      return savedComponents;
    },
  };
}

function createInventoryRepository(initialItems: CloudInventoryItem[]): InventoryItemRepository {
  const items = [...initialItems];

  return {
    async create(input: CreateInventoryItemInput) {
      const item: CloudInventoryItem = {
        bestBeforeDate: input.bestBeforeDate,
        category: input.category,
        createdAt: input.now,
        hazardous: input.hazardous ?? false,
        id: input.id,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        updatedAt: input.now,
        useByDate: input.useByDate,
        userId: input.userId,
      };
      items.push(item);
      return item;
    },
    async deleteForUser(userId, id) {
      const index = items.findIndex((item) => item.userId === userId && item.id === id);
      if (index >= 0) {
        items.splice(index, 1);
      }
    },
    async findByIdForUser(userId, id) {
      return items.find((item) => item.userId === userId && item.id === id) ?? null;
    },
    async listByUserId(userId) {
      return items.filter((item) => item.userId === userId);
    },
    async update(input: UpdateInventoryItemInput) {
      const item: CloudInventoryItem = {
        bestBeforeDate: input.bestBeforeDate,
        category: input.category,
        createdAt: input.createdAt,
        hazardous: input.hazardous,
        id: input.id,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        updatedAt: input.now,
        useByDate: input.useByDate,
        userId: input.userId,
      };
      const index = items.findIndex(
        (storedItem) => storedItem.id === input.id && storedItem.userId === input.userId,
      );
      if (index < 0) {
        return null;
      }
      items[index] = item;
      return item;
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
