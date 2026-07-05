import { describe, expect, it } from "vitest";
import type {
  UserProfile,
  UserProfileRepository,
} from "../../repositories/cloudflare-d1/D1UserProfileRepository";
import type { ClerkSession } from "../auth/clerk";
import { handleGetMe, handlePostMeProfile, normalizeUserHandle } from "./profile";
import type { D1Database, WorkerEnv } from "./types";

const env: WorkerEnv = {
  DB: {} as D1Database,
};

const session: ClerkSession = {
  authProvider: "clerk",
  authSubject: "user_test",
  claims: {
    azp: "https://example.test",
    sid: "sess_test",
    sub: "user_test",
  } as ClerkSession["claims"],
  sessionId: "sess_test",
  tokenSource: "authorization",
};

const baseProfile: UserProfile = {
  authProvider: "clerk",
  authSubject: "user_test",
  contributionVisibility: "summary_only",
  createdAt: "2026-07-06T00:00:00.000Z",
  id: "profile_test",
  updatedAt: "2026-07-06T00:00:00.000Z",
  username: "test-user",
};

async function parseJson(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("profile API handlers", () => {
  it("normalizes valid user handles", () => {
    expect(normalizeUserHandle(" Shoma-Recipes ")).toBe("shoma-recipes");
    expect(normalizeUserHandle("a")).toBe("a");
  });

  it.each([
    "-shoma",
    "shoma-",
    "sho_ma",
    "",
    "a".repeat(40),
    "api",
    "backup",
    "eol",
    "inventory",
    "new",
    "repositories",
    "security",
    "users",
    123,
  ])("rejects invalid user handle %s", (value) => {
    expect(normalizeUserHandle(value)).toBeNull();
  });

  it("returns the current user profile", async () => {
    const response = await handleGetMe(session, env, {
      userProfiles: createUserProfileRepository([baseProfile]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      profile: {
        contributionVisibility: "summary_only",
        createdAt: "2026-07-06T00:00:00.000Z",
        id: "profile_test",
        updatedAt: "2026-07-06T00:00:00.000Z",
        username: "test-user",
      },
    });
    expect(response.status).toBe(200);
  });

  it("rejects GET /api/me before profile bootstrap", async () => {
    const response = await handleGetMe(session, env, {
      userProfiles: createUserProfileRepository([]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "profile_not_initialized",
        message: "Create a profile before accessing this endpoint.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("returns a JSON error when profile lookup fails", async () => {
    const response = await handleGetMe(session, env, {
      userProfiles: {
        ...createUserProfileRepository([]),
        async findByAuthSubject() {
          throw new Error("D1 unavailable");
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to load profile.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("creates the current user's profile", async () => {
    const response = await handlePostMeProfile(
      new Request("https://example.test/api/me/profile", {
        body: JSON.stringify({
          avatarUrl: "https://example.test/avatar.png",
          displayName: " Test User ",
          username: " Test-User ",
        }),
        method: "POST",
      }),
      session,
      env,
      {
        createProfileId: () => "profile_new",
        now: () => new Date("2026-07-06T01:02:03.000Z"),
        userProfiles: createUserProfileRepository([]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      profile: {
        avatarUrl: "https://example.test/avatar.png",
        contributionVisibility: "summary_only",
        createdAt: "2026-07-06T01:02:03.000Z",
        displayName: "Test User",
        id: "profile_new",
        updatedAt: "2026-07-06T01:02:03.000Z",
        username: "test-user",
      },
    });
    expect(response.status).toBe(201);
  });

  it("creates a profile with only the required username", async () => {
    const response = await handlePostMeProfile(
      new Request("https://example.test/api/me/profile", {
        body: JSON.stringify({
          username: "minimal-user",
        }),
        method: "POST",
      }),
      session,
      env,
      {
        createProfileId: () => "profile_minimal",
        now: () => new Date("2026-07-06T01:02:03.000Z"),
        userProfiles: createUserProfileRepository([]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      profile: {
        contributionVisibility: "summary_only",
        createdAt: "2026-07-06T01:02:03.000Z",
        id: "profile_minimal",
        updatedAt: "2026-07-06T01:02:03.000Z",
        username: "minimal-user",
      },
    });
    expect(response.status).toBe(201);
  });

  it("rejects duplicate profile bootstrap for the same Clerk user", async () => {
    const response = await handlePostMeProfile(
      new Request("https://example.test/api/me/profile", {
        body: JSON.stringify({ username: "another-user" }),
        method: "POST",
      }),
      session,
      env,
      {
        userProfiles: createUserProfileRepository([baseProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "profile_already_exists",
        message: "A profile already exists for this Clerk user.",
      },
    });
    expect(response.status).toBe(409);
  });

  it("returns a JSON error when pre-create profile reads fail", async () => {
    const response = await handlePostMeProfile(
      new Request("https://example.test/api/me/profile", {
        body: JSON.stringify({ username: "good-user" }),
        method: "POST",
      }),
      session,
      env,
      {
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
        message: "Failed to create profile.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("rejects reserved user handles", async () => {
    const response = await handlePostMeProfile(
      new Request("https://example.test/api/me/profile", {
        body: JSON.stringify({ username: "test-user" }),
        method: "POST",
      }),
      {
        ...session,
        authSubject: "user_other",
      },
      env,
      {
        userProfiles: createUserProfileRepository([baseProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "username_reserved",
        message: "This User Handle is already reserved.",
      },
    });
    expect(response.status).toBe(409);
  });

  it("rejects invalid profile bootstrap input", async () => {
    const response = await handlePostMeProfile(
      new Request("https://example.test/api/me/profile", {
        body: JSON.stringify({ username: "-bad" }),
        method: "POST",
      }),
      session,
      env,
      {
        userProfiles: createUserProfileRepository([]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "validation_failed",
        message: "Username must be 1-39 lowercase letters, numbers, or hyphens.",
      },
    });
    expect(response.status).toBe(400);
  });

  it.each([
    {
      body: "not-json",
      expectedMessage: "Request body must be valid JSON.",
    },
    {
      body: JSON.stringify([]),
      expectedMessage: "Request body must be a JSON object.",
    },
    {
      body: JSON.stringify({ displayName: "x".repeat(81), username: "good-user" }),
      expectedMessage: "Display name must be 80 characters or fewer.",
    },
    {
      body: JSON.stringify({ displayName: 123, username: "good-user" }),
      expectedMessage: "Display name must be 80 characters or fewer.",
    },
    {
      body: JSON.stringify({ avatarUrl: "ftp://example.test/avatar.png", username: "good-user" }),
      expectedMessage: "Avatar URL must be a valid http or https URL.",
    },
    {
      body: JSON.stringify({ avatarUrl: "not-a-url", username: "good-user" }),
      expectedMessage: "Avatar URL must be a valid http or https URL.",
    },
    {
      body: JSON.stringify({ avatarUrl: 123, username: "good-user" }),
      expectedMessage: "Avatar URL must be a valid http or https URL.",
    },
  ])("rejects invalid bootstrap body %#", async ({ body, expectedMessage }) => {
    const response = await handlePostMeProfile(
      new Request("https://example.test/api/me/profile", {
        body,
        method: "POST",
      }),
      session,
      env,
      {
        userProfiles: createUserProfileRepository([]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "validation_failed",
        message: expectedMessage,
      },
    });
    expect(response.status).toBe(400);
  });

  it("returns an internal error if profile creation fails", async () => {
    const response = await handlePostMeProfile(
      new Request("https://example.test/api/me/profile", {
        body: JSON.stringify({ username: "good-user" }),
        method: "POST",
      }),
      session,
      env,
      {
        createProfileId: () => "profile_new",
        now: () => new Date("2026-07-06T01:02:03.000Z"),
        userProfiles: {
          ...createUserProfileRepository([]),
          async create() {
            throw new Error("D1 unavailable");
          },
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to create profile.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns a JSON error if post-create diagnostic reads fail", async () => {
    const response = await handlePostMeProfile(
      new Request("https://example.test/api/me/profile", {
        body: JSON.stringify({ username: "good-user" }),
        method: "POST",
      }),
      session,
      env,
      {
        createProfileId: () => "profile_new",
        now: () => new Date("2026-07-06T01:02:03.000Z"),
        userProfiles: {
          ...createUserProfileRepository([]),
          async create() {
            throw new Error("D1 unavailable");
          },
          async findByUsername() {
            throw new Error("D1 unavailable");
          },
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to create profile.",
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
