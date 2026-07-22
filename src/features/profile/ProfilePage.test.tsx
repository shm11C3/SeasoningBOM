import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CloudApiProvider } from "../../app/providers/CloudApiProvider";
import {
  CloudApiError,
  type CloudContributionList,
  type CloudRepository,
  type CloudUserProfile,
  type SeasoningBomApiClient,
} from "../../repositories/cloud-api/SeasoningBomApiClient";
import { makeRecipe } from "../../test/factories/domainFactories";
import { ProfilePage } from "./ProfilePage";

const liveDataMock = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("../useLiveData", () => ({
  useLiveData: () => liveDataMock.current,
}));

const profile: CloudUserProfile = {
  avatarUrl: "https://example.test/avatar.png",
  contributionVisibility: "public",
  createdAt: "2026-01-01T00:00:00.000Z",
  displayName: "Test Cook",
  id: "profile_test",
  updatedAt: "2026-07-23T00:00:00.000Z",
  username: "test-cook",
};

const contributions: CloudContributionList = {
  days: [
    { contributionCount: 0, date: "2026-07-20", level: 0 },
    { contributionCount: 1, date: "2026-07-21", level: 1 },
    { contributionCount: 2, date: "2026-07-22", level: 2 },
    { contributionCount: 0, date: "2026-07-23", level: 0 },
  ],
  detailsVisible: true,
  from: "2026-07-20",
  profile,
  to: "2026-07-23",
  totalContributions: 3,
};

const repository: CloudRepository = {
  createdAt: "2026-01-01T00:00:00.000Z",
  description: "Cloud curry",
  id: "repo_cloud",
  name: "Cloud Curry",
  ownerHandle: "test-cook",
  servings: 2,
  slug: "cloud-curry",
  tags: [],
  updatedAt: "2026-07-23T00:00:00.000Z",
  version: "1.0.0",
  visibility: "public",
};

describe("ProfilePage", () => {
  it("shows a local prototype profile with pinned repositories", () => {
    liveDataMock.current = {
      recipes: [
        makeRecipe(),
        makeRecipe({ id: "recipe-private", slug: "private-stew", visibility: "private" }),
        makeRecipe({ id: "recipe-other", ownerHandle: "other", slug: "other-soup" }),
      ],
    };

    renderProfile(null, "me");

    expect(screen.getByRole("heading", { name: "me" })).toBeInTheDocument();
    expect(screen.getAllByText("2")).toHaveLength(2);
    const curryCard = screen.getByRole("link", { name: /me\/curry-rice/ });
    expect(curryCard).toHaveAttribute("href", "/me/curry-rice");
    expect(within(curryCard).getByText("public")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /me\/private-stew/ })).toHaveAttribute(
      "href",
      "/me/private-stew",
    );
    expect(screen.queryByText("other/other-soup")).not.toBeInTheDocument();
  });

  it("shows an empty state for unknown local profiles", () => {
    liveDataMock.current = {
      recipes: [makeRecipe()],
    };

    renderProfile(null, "missing");

    expect(screen.getByText("Profile not found")).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
  });

  it("loads a cloud profile, annual graph, public repositories, and day details", async () => {
    const user = userEvent.setup();
    const client = createClient({
      getUserContributionDay: vi.fn().mockResolvedValue({
        contributionCount: 1,
        date: "2026-07-21",
        detailsVisible: true,
        events: [
          {
            contributionCount: 1,
            eventType: "cooking_logged",
            id: "event_cook",
            metadata: {},
            occurredAt: "2026-07-21T12:00:00.000Z",
            occurredOn: "2026-07-21",
            visibility: "public",
          },
        ],
        level: 1,
        profile,
      }),
      listPublicRepositories: vi
        .fn()
        .mockResolvedValue([
          repository,
          { ...repository, id: "repo_other", ownerHandle: "another-cook", slug: "other" },
        ]),
    });

    renderProfile(client, "test-cook");

    expect(await screen.findByRole("heading", { name: "Test Cook" })).toBeInTheDocument();
    expect(screen.getByText("@test-cook")).toBeInTheDocument();
    expect(screen.getByText("contributions in the last year").previousSibling).toHaveTextContent(
      "3",
    );
    expect(screen.getByText("longest cooking streak").previousSibling).toHaveTextContent("2");
    expect(
      screen.getByRole("group", { name: "Cooking contribution calendar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /test-cook\/cloud-curry/ })).toHaveAttribute(
      "href",
      "/test-cook/cloud-curry",
    );
    expect(screen.queryByText("another-cook/other")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "1 contribution on 2026-07-21, Light simmer",
      }),
    );

    expect(await screen.findByText("Cooking logged")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(client.getUserContributionDay).toHaveBeenCalledWith(
      "test-cook",
      "2026-07-21",
      expect.any(AbortSignal),
    );
  });

  it("shows a profile while keeping a private contribution graph hidden", async () => {
    const client = createClient({
      getUserContributions: vi
        .fn()
        .mockRejectedValue(new CloudApiError(404, "Profile not found.", "not_found")),
    });

    renderProfile(client, "test-cook");

    expect(await screen.findByRole("heading", { name: "Test Cook" })).toBeInTheDocument();
    expect(screen.getByText("Contribution activity is private")).toBeInTheDocument();
  });

  it("shows summary-only counts without requesting private day details", async () => {
    const user = userEvent.setup();
    const client = createClient({
      getUserContributions: vi.fn().mockResolvedValue({
        ...contributions,
        detailsVisible: false,
      }),
    });

    renderProfile(client, "test-cook");
    await user.click(
      await screen.findByRole("button", {
        name: "2 contributions on 2026-07-22, Medium heat",
      }),
    );

    expect(screen.getByText("Daily activity details are private.")).toBeInTheDocument();
    expect(client.getUserContributionDay).not.toHaveBeenCalled();
  });

  it("shows empty and failed contribution day states", async () => {
    const user = userEvent.setup();
    const emptyClient = createClient();
    const { unmount } = renderProfile(emptyClient, "test-cook");

    await user.click(
      await screen.findByRole("button", {
        name: "0 contributions on 2026-07-23, No cooking",
      }),
    );
    expect(await screen.findByText("No visible cooking events.")).toBeInTheDocument();
    unmount();

    const failedClient = createClient({
      getUserContributionDay: vi.fn().mockRejectedValue(new Error("network unavailable")),
    });
    renderProfile(failedClient, "test-cook");

    await user.click(
      await screen.findByRole("button", {
        name: "1 contribution on 2026-07-21, Light simmer",
      }),
    );
    expect(await screen.findByText("Activity details could not be loaded.")).toBeInTheDocument();
  });

  it("renders cloud profile fallbacks and an empty contribution range", async () => {
    const fallbackProfile = { ...profile, avatarUrl: undefined, displayName: undefined };
    const client = createClient({
      getPublicProfile: vi.fn().mockResolvedValue(fallbackProfile),
      getUserContributions: vi.fn().mockResolvedValue({
        ...contributions,
        days: [],
        profile: fallbackProfile,
        totalContributions: 0,
      }),
    });

    renderProfile(client, "test-cook");

    expect(await screen.findByRole("heading", { name: "test-cook" })).toBeInTheDocument();
    expect(screen.getByText("No public repositories")).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Cooking contribution calendar" })).queryAllByRole(
        "button",
      ),
    ).toHaveLength(0);
  });

  it("keeps the profile useful when optional cloud resources fail", async () => {
    const client = createClient({
      getUserContributions: vi.fn().mockRejectedValue(new Error("network unavailable")),
      listPublicRepositories: vi.fn().mockRejectedValue(new Error("network unavailable")),
    });

    renderProfile(client, "test-cook");

    expect(await screen.findByRole("heading", { name: "Test Cook" })).toBeInTheDocument();
    expect(screen.getByText("Contributions unavailable")).toBeInTheDocument();
    expect(screen.getByText("Repositories unavailable")).toBeInTheDocument();
  });

  it("shows cloud not-found and failure states", async () => {
    const notFoundClient = createClient({
      getPublicProfile: vi.fn().mockRejectedValue(new CloudApiError(404, "Profile not found.")),
    });
    const { unmount } = renderProfile(notFoundClient, "missing");

    expect(await screen.findByText("Profile not found")).toBeInTheDocument();
    unmount();

    const failedClient = createClient({
      getPublicProfile: vi.fn().mockRejectedValue(new Error("network unavailable")),
    });
    renderProfile(failedClient, "broken");

    expect(await screen.findByText("Profile unavailable")).toBeInTheDocument();
  });

  it("aborts cloud profile loading when the route changes", async () => {
    let observedSignal: AbortSignal | undefined;
    let resolveProfile: ((value: CloudUserProfile) => void) | undefined;
    const client = createClient({
      getPublicProfile: vi.fn((_username, signal) => {
        observedSignal = signal;
        return new Promise<CloudUserProfile>((resolve) => {
          resolveProfile = resolve;
        });
      }),
    });
    const { unmount } = renderProfile(client, "test-cook");

    await waitFor(() => expect(observedSignal).toBeDefined());
    unmount();

    expect(observedSignal?.aborted).toBe(true);
    resolveProfile?.(profile);
    await Promise.resolve();
    await Promise.resolve();
  });
});

function renderProfile(client: SeasoningBomApiClient | null, username: string) {
  return render(
    <CloudApiProvider client={client}>
      <ProfilePage username={username} />
    </CloudApiProvider>,
  );
}

function createClient(overrides: Partial<SeasoningBomApiClient> = {}): SeasoningBomApiClient {
  return {
    getPublicProfile: vi.fn().mockResolvedValue(profile),
    getRepository: vi.fn(),
    getRepositoryBom: vi.fn(),
    getRepositoryDependencies: vi.fn(),
    getRepositorySecurity: vi.fn(),
    getUserContributionDay: vi.fn().mockResolvedValue({
      contributionCount: 0,
      date: "2026-07-23",
      detailsVisible: true,
      events: [],
      level: 0,
      profile,
    }),
    getUserContributions: vi.fn().mockResolvedValue(contributions),
    listPublicRepositories: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}
