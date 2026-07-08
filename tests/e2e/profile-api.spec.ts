import { expect, test } from "@playwright/test";
import type {
  CloudContributionEvent,
  ContributionDateCount,
  ContributionRepository,
} from "../../src/repositories/cloudflare-d1/D1ContributionRepository";
import type {
  UserProfile,
  UserProfileRepository,
} from "../../src/repositories/cloudflare-d1/D1UserProfileRepository";
import { handleApiRequest } from "../../src/workers/api/router";
import type { D1Database, WorkerEnv } from "../../src/workers/api/types";
import type { ClerkAuthenticationOptions } from "../../src/workers/auth/clerk";

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

test("anonymous users can read summary-only profile graph counts without day details", async () => {
  const profile = await handleApiRequest(
    new Request("https://example.test/api/users/test-user/profile"),
    env,
    {
      userProfiles: createUserProfileRepository([userProfile]),
    },
  );
  const graph = await handleApiRequest(
    new Request(
      "https://example.test/api/users/test-user/contributions?from=2026-07-06&to=2026-07-07",
    ),
    env,
    {
      contributions: createContributionRepository([
        { contributionCount: 1, occurredOn: "2026-07-06" },
      ]),
      userProfiles: createUserProfileRepository([userProfile]),
    },
  );
  const day = await handleApiRequest(
    new Request("https://example.test/api/users/test-user/contributions/2026-07-06"),
    env,
    {
      contributions: createContributionRepository(
        [{ contributionCount: 1, occurredOn: "2026-07-06" }],
        [contributionEvent],
      ),
      userProfiles: createUserProfileRepository([userProfile]),
    },
  );

  await expect(profile.json()).resolves.toEqual({
    profile: expect.objectContaining({
      id: "profile_test",
      username: "test-user",
    }),
  });
  expect(profile.status).toBe(200);
  await expect(graph.json()).resolves.toEqual(
    expect.objectContaining({
      days: [
        { contributionCount: 1, date: "2026-07-06", level: 1 },
        { contributionCount: 0, date: "2026-07-07", level: 0 },
      ],
      detailsVisible: false,
      totalContributions: 1,
    }),
  );
  expect(graph.status).toBe(200);
  await expect(day.json()).resolves.toEqual(
    expect.objectContaining({
      detailsVisible: false,
      events: [],
    }),
  );
  expect(day.status).toBe(200);
});

test("authenticated owners can read summary-only contribution day details", async () => {
  const response = await handleApiRequest(
    new Request("https://example.test/api/users/test-user/contributions/2026-07-06", {
      headers: {
        authorization: "Bearer fake-session",
      },
    }),
    configuredEnv,
    {
      ...validSessionAuth,
      contributions: createContributionRepository(
        [{ contributionCount: 1, occurredOn: "2026-07-06" }],
        [contributionEvent],
      ),
      userProfiles: createUserProfileRepository([userProfile]),
    },
  );

  await expect(response.json()).resolves.toEqual(
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

test("private contribution graph routes are hidden from anonymous users", async () => {
  const privateProfile: UserProfile = {
    ...userProfile,
    authSubject: "user_private",
    contributionVisibility: "private",
    id: "profile_private",
    username: "private-user",
  };
  const response = await handleApiRequest(
    new Request(
      "https://example.test/api/users/private-user/contributions?from=2026-07-06&to=2026-07-06",
    ),
    env,
    {
      contributions: createContributionRepository([
        { contributionCount: 1, occurredOn: "2026-07-06" },
      ]),
      userProfiles: createUserProfileRepository([privateProfile]),
    },
  );

  await expect(response.json()).resolves.toEqual({
    error: {
      code: "not_found",
      message: "Profile not found.",
    },
  });
  expect(response.status).toBe(404);
});

test("profile contribution routes reject unsupported methods", async () => {
  const profilePost = await handleApiRequest(
    new Request("https://example.test/api/users/test-user/profile", { method: "POST" }),
    env,
  );
  const contributionsPost = await handleApiRequest(
    new Request("https://example.test/api/users/test-user/contributions", { method: "POST" }),
    env,
  );
  const dayHead = await handleApiRequest(
    new Request("https://example.test/api/users/test-user/contributions/2026-07-06", {
      method: "HEAD",
    }),
    env,
  );

  expect(profilePost.status).toBe(405);
  expect(profilePost.headers.get("allow")).toBe("GET");
  expect(contributionsPost.status).toBe(405);
  expect(contributionsPost.headers.get("allow")).toBe("GET");
  expect(dayHead.status).toBe(405);
  expect(dayHead.headers.get("allow")).toBe("GET");
  await expect(dayHead.text()).resolves.toBe("");
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
