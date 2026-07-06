import { describe, expect, it } from "vitest";
import type {
  CloudInventoryItem,
  CreateInventoryItemInput,
  InventoryItemRepository,
  UpdateInventoryItemInput,
} from "../../repositories/cloudflare-d1/D1InventoryRepository";
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
