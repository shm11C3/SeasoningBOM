import { describe, expect, it } from "vitest";
import type {
  CloudContributionEvent,
  ContributionDateCount,
  ContributionRepository,
} from "../../repositories/cloudflare-d1/D1ContributionRepository";
import type {
  UserProfile,
  UserProfileRepository,
} from "../../repositories/cloudflare-d1/D1UserProfileRepository";
import type { ClerkSession } from "../auth/clerk";
import {
  handleGetMe,
  handleGetPublicProfile,
  handleGetUserContributionDay,
  handleGetUserContributions,
  handlePostMeProfile,
  normalizeUserHandle,
} from "./profile";
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

const publicProfile: UserProfile = {
  ...baseProfile,
  authSubject: "user_public",
  contributionVisibility: "public",
  id: "profile_public",
  username: "public-user",
};

const privateProfile: UserProfile = {
  ...baseProfile,
  authSubject: "user_private",
  contributionVisibility: "private",
  id: "profile_private",
  username: "private-user",
};

const contributionEvent: CloudContributionEvent = {
  contributionCount: 1,
  eventType: "cooking_logged",
  id: "contribution_cook",
  metadata: {
    repositoryName: "Public Curry",
    result: "cooked",
  },
  occurredAt: "2026-07-06T04:05:06.000Z",
  occurredOn: "2026-07-06",
  repositoryId: "repo_public",
  userId: "profile_test",
  visibility: "summary_only",
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

  it("returns public profile data by username", async () => {
    const response = await handleGetPublicProfile("test-user", env, {
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

  it("returns not found when a public profile handle is missing", async () => {
    const response = await handleGetPublicProfile("missing-user", env, {
      userProfiles: createUserProfileRepository([baseProfile]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Profile not found.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("returns a JSON error when public profile lookup fails", async () => {
    const response = await handleGetPublicProfile("test-user", env, {
      userProfiles: {
        ...createUserProfileRepository([]),
        async findByUsername() {
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

  it("returns contribution graph counts without exposing summary-only details", async () => {
    const response = await handleGetUserContributions(
      new Request(
        "https://example.test/api/users/test-user/contributions?from=2026-07-06&to=2026-07-08",
      ),
      "test-user",
      null,
      env,
      {
        contributions: createContributionRepository([
          { contributionCount: 1, occurredOn: "2026-07-06" },
          { contributionCount: 7, occurredOn: "2026-07-08" },
        ]),
        userProfiles: createUserProfileRepository([baseProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      days: [
        { contributionCount: 1, date: "2026-07-06", level: 1 },
        { contributionCount: 0, date: "2026-07-07", level: 0 },
        { contributionCount: 7, date: "2026-07-08", level: 4 },
      ],
      detailsVisible: false,
      from: "2026-07-06",
      profile: expect.objectContaining({
        id: "profile_test",
        username: "test-user",
      }),
      to: "2026-07-08",
      totalContributions: 8,
    });
    expect(response.status).toBe(200);
  });

  it("returns a JSON error when contribution graph loading fails", async () => {
    const response = await handleGetUserContributions(
      new Request(
        "https://example.test/api/users/test-user/contributions?from=2026-07-06&to=2026-07-06",
      ),
      "test-user",
      null,
      env,
      {
        contributions: {
          ...createContributionRepository([]),
          async listCountsByDate() {
            throw new Error("D1 unavailable");
          },
        },
        userProfiles: createUserProfileRepository([baseProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to load contributions.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("uses the latest year as the default contribution range", async () => {
    const response = await handleGetUserContributions(
      new Request("https://example.test/api/users/test-user/contributions"),
      "test-user",
      null,
      env,
      {
        contributions: createContributionRepository([]),
        now: () => new Date("2026-07-08T12:00:00.000Z"),
        userProfiles: createUserProfileRepository([baseProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual(
      expect.objectContaining({
        days: expect.arrayContaining([
          { contributionCount: 0, date: "2025-07-09", level: 0 },
          { contributionCount: 0, date: "2026-07-08", level: 0 },
        ]),
        from: "2025-07-09",
        to: "2026-07-08",
      }),
    );
    expect(response.status).toBe(200);
  });

  it("hides private contribution graphs from third parties", async () => {
    const response = await handleGetUserContributions(
      new Request(
        "https://example.test/api/users/private-user/contributions?from=2026-07-06&to=2026-07-08",
      ),
      "private-user",
      null,
      env,
      {
        contributions: createContributionRepository([
          { contributionCount: 1, occurredOn: "2026-07-06" },
        ]),
        userProfiles: createUserProfileRepository([privateProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Profile not found.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("shows private contribution graphs to the owner", async () => {
    const response = await handleGetUserContributions(
      new Request(
        "https://example.test/api/users/private-user/contributions?from=2026-07-06&to=2026-07-06",
      ),
      "private-user",
      privateProfile,
      env,
      {
        contributions: createContributionRepository([
          { contributionCount: 2, occurredOn: "2026-07-06" },
        ]),
        userProfiles: createUserProfileRepository([privateProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual(
      expect.objectContaining({
        days: [{ contributionCount: 2, date: "2026-07-06", level: 2 }],
        detailsVisible: true,
        totalContributions: 2,
      }),
    );
    expect(response.status).toBe(200);
  });

  it("hides private contribution day data from third parties", async () => {
    const response = await handleGetUserContributionDay("private-user", "2026-07-06", null, env, {
      contributions: createContributionRepository(
        [{ contributionCount: 4, occurredOn: "2026-07-06" }],
        [{ ...contributionEvent, userId: "profile_private", visibility: "private" }],
      ),
      userProfiles: createUserProfileRepository([privateProfile]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Profile not found.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("returns contribution day counts without summary-only event details", async () => {
    const response = await handleGetUserContributionDay("test-user", "2026-07-06", null, env, {
      contributions: createContributionRepository(
        [{ contributionCount: 1, occurredOn: "2026-07-06" }],
        [contributionEvent],
      ),
      userProfiles: createUserProfileRepository([baseProfile]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      contributionCount: 1,
      date: "2026-07-06",
      detailsVisible: false,
      events: [],
      level: 1,
      profile: expect.objectContaining({
        id: "profile_test",
      }),
    });
    expect(response.status).toBe(200);
  });

  it("returns level 3 for high contribution days", async () => {
    const response = await handleGetUserContributionDay("test-user", "2026-07-06", null, env, {
      contributions: createContributionRepository([
        { contributionCount: 4, occurredOn: "2026-07-06" },
      ]),
      userProfiles: createUserProfileRepository([baseProfile]),
    });

    await expect(parseJson(response)).resolves.toEqual(
      expect.objectContaining({
        contributionCount: 4,
        level: 3,
      }),
    );
    expect(response.status).toBe(200);
  });

  it("returns public contribution event details to third parties", async () => {
    const response = await handleGetUserContributionDay("public-user", "2026-07-06", null, env, {
      contributions: createContributionRepository(
        [{ contributionCount: 1, occurredOn: "2026-07-06" }],
        [
          {
            ...contributionEvent,
            userId: "profile_public",
            visibility: "public",
          },
        ],
      ),
      userProfiles: createUserProfileRepository([publicProfile]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      contributionCount: 1,
      date: "2026-07-06",
      detailsVisible: true,
      events: [
        {
          contributionCount: 1,
          eventType: "cooking_logged",
          id: "contribution_cook",
          metadata: {
            repositoryName: "Public Curry",
            result: "cooked",
          },
          occurredAt: "2026-07-06T04:05:06.000Z",
          occurredOn: "2026-07-06",
          repositoryId: "repo_public",
          visibility: "public",
        },
      ],
      level: 1,
      profile: expect.objectContaining({
        id: "profile_public",
      }),
    });
    expect(response.status).toBe(200);
  });

  it("returns summary-only contribution event details to the owner", async () => {
    const response = await handleGetUserContributionDay(
      "test-user",
      "2026-07-06",
      baseProfile,
      env,
      {
        contributions: createContributionRepository(
          [{ contributionCount: 1, occurredOn: "2026-07-06" }],
          [contributionEvent],
        ),
        userProfiles: createUserProfileRepository([baseProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual(
      expect.objectContaining({
        detailsVisible: true,
        events: [
          expect.objectContaining({
            id: "contribution_cook",
            visibility: "summary_only",
          }),
        ],
      }),
    );
    expect(response.status).toBe(200);
  });

  it("returns a JSON error when contribution day loading fails", async () => {
    const response = await handleGetUserContributionDay(
      "test-user",
      "2026-07-06",
      baseProfile,
      env,
      {
        contributions: {
          ...createContributionRepository([]),
          async listEventsForDate() {
            throw new Error("D1 unavailable");
          },
        },
        userProfiles: createUserProfileRepository([baseProfile]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to load contribution day.",
      },
    });
    expect(response.status).toBe(500);
  });

  it.each([
    {
      path: "https://example.test/api/users/test-user/contributions?from=bad&to=2026-07-06",
      message: "Contribution range must use YYYY-MM-DD dates.",
    },
    {
      path: "https://example.test/api/users/test-user/contributions?from=2026-07-07&to=2026-07-06",
      message: "Contribution range must have from before or equal to to.",
    },
    {
      path: "https://example.test/api/users/test-user/contributions?from=2025-07-06&to=2026-07-07",
      message: "Contribution range must span 366 days or fewer.",
    },
  ])("rejects invalid contribution ranges %#", async ({ path, message }) => {
    const response = await handleGetUserContributions(new Request(path), "test-user", null, env, {
      contributions: createContributionRepository([]),
      userProfiles: createUserProfileRepository([baseProfile]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "validation_failed",
        message,
      },
    });
    expect(response.status).toBe(400);
  });

  it("rejects invalid contribution day dates", async () => {
    const response = await handleGetUserContributionDay("test-user", "2026-02-31", null, env, {
      contributions: createContributionRepository([]),
      userProfiles: createUserProfileRepository([baseProfile]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "validation_failed",
        message: "Contribution date must use YYYY-MM-DD.",
      },
    });
    expect(response.status).toBe(400);
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

function createContributionRepository(
  initialCounts: ContributionDateCount[],
  initialEvents: CloudContributionEvent[] = [],
): ContributionRepository {
  const counts = [...initialCounts];
  const events = [...initialEvents];

  return {
    async listCountsByDate(input) {
      return counts.filter(
        (count) => count.occurredOn >= input.from && count.occurredOn <= input.to,
      );
    },
    async listEventsForDate(input) {
      return events.filter((event) => {
        return (
          event.userId === input.userId &&
          event.occurredOn === input.occurredOn &&
          (!input.publicOnly || event.visibility === "public")
        );
      });
    },
  };
}

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
