import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloudApiProvider } from "../../app/providers/CloudApiProvider";
import type {
  CloudRepository,
  SeasoningBomApiClient,
} from "../../repositories/cloud-api/SeasoningBomApiClient";
import { createCloudApiClientMock } from "../../test/factories/cloudApiFactories";
import {
  makeComponent,
  makeInventoryItem,
  makeRecipe,
  makeSettings,
} from "../../test/factories/domainFactories";
import { DashboardPage } from "./DashboardPage";

const liveDataMock = vi.hoisted(() => ({
  current: null as unknown,
}));
const cloudProfileMock = vi.hoisted(() => ({
  current: { profile: null, status: "disabled" } as unknown,
}));

vi.mock("../useLiveData", () => ({
  useLiveData: () => liveDataMock.current,
}));

vi.mock("../../app/providers/CloudProfileProvider", () => ({
  useCloudProfile: () => cloudProfileMock.current,
}));

describe("DashboardPage repository cards", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders an empty state when no recipe repositories exist", () => {
    liveDataMock.current = {
      components: [],
      inventoryItems: [],
      ready: true,
      recipes: [],
      repositories: {},
      settings: makeSettings(),
    };

    render(<DashboardPage />);

    expect(screen.getByText("No recipe repositories")).toBeInTheDocument();
  });

  it("renders each repository as one card-level link", async () => {
    liveDataMock.current = {
      components: [makeComponent()],
      inventoryItems: [makeInventoryItem()],
      ready: true,
      recipes: [makeRecipe()],
      repositories: {},
      settings: makeSettings(),
    };

    render(<DashboardPage />);

    const user = userEvent.setup();
    const curryCard = await screen.findByRole("link", { name: "Open Curry Rice" });

    expect(curryCard).toHaveClass("repo-card", "repo-card-link");
    expect(curryCard).toHaveAttribute("href", "/me/curry-rice");
    expect(curryCard.querySelector("a")).toBeNull();
    expect(curryCard.querySelector(".repo-name")?.tagName).toBe("SPAN");
    expect(within(curryCard).getByText("me/curry-rice")).toHaveClass("repo-name");

    await user.click(curryCard);

    await waitFor(() => expect(window.location.pathname).toBe("/me/curry-rice"));
  });

  it("renders repositories even when component data has not arrived for that recipe", () => {
    liveDataMock.current = {
      components: [],
      inventoryItems: [],
      ready: true,
      recipes: [makeRecipe({ tags: [] })],
      repositories: {},
      settings: makeSettings(),
    };

    render(<DashboardPage />);

    const curryCard = screen.getByRole("link", { name: "Open Curry Rice" });
    expect(within(curryCard).getByText("0 dependencies")).toBeInTheDocument();
    expect(within(curryCard).getByText("0 alerts")).toBeInTheDocument();
  });
});

describe("DashboardPage cloud repositories", () => {
  const repository: CloudRepository = {
    createdAt: "2026-07-23T00:00:00.000Z",
    description: "A shared curry recipe",
    id: "repo_cloud",
    name: "Cloud Curry",
    ownerHandle: "test-cook",
    readme: "# Cloud Curry",
    servings: 4,
    slug: "cloud-curry",
    tags: ["curry"],
    updatedAt: "2026-07-23T00:00:00.000Z",
    version: "1.0.0",
    visibility: "public",
  };

  beforeEach(() => {
    cloudProfileMock.current = { profile: null, status: "disabled" };
  });

  it("loads public repositories without local-only counts or actions", async () => {
    const client = createCloudClient({
      listPublicRepositories: vi.fn().mockResolvedValue([
        repository,
        {
          ...repository,
          description: undefined,
          id: "repo_fork",
          name: "Forked Curry",
          ownerHandle: "another-cook",
          slug: "forked-curry",
          sourceRepositoryId: repository.id,
          tags: [],
        },
      ]),
    });

    renderCloudDashboard(client);

    expect(screen.getByText("Loading repositories")).toBeInTheDocument();
    const card = await screen.findByRole("link", { name: "Open Cloud Curry" });
    expect(within(card).getByText("test-cook/cloud-curry")).toBeInTheDocument();
    expect(screen.getByText("No description provided.")).toBeInTheDocument();
    expect(screen.getByText("Forked from repo_cloud")).toBeInTheDocument();
    expect(screen.getAllByText("2", { selector: ".stat strong" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "New recipe" })).not.toBeInTheDocument();
    expect(screen.queryByText(/stars|forks|alerts/)).not.toBeInTheDocument();
  });

  it("renders cloud empty and failure states", async () => {
    const { rerender } = renderCloudDashboard(
      createCloudClient({ listPublicRepositories: vi.fn().mockResolvedValue([]) }),
    );
    expect(await screen.findByText("No public recipe repositories")).toBeInTheDocument();

    rerender(
      <CloudApiProvider
        client={createCloudClient({
          listPublicRepositories: vi.fn().mockRejectedValue(new Error("offline")),
        })}
      >
        <DashboardPage />
      </CloudApiProvider>,
    );
    expect(await screen.findByText("Repositories unavailable")).toBeInTheDocument();
  });

  it("offers repository creation to a bootstrapped cloud user", async () => {
    const user = userEvent.setup();
    cloudProfileMock.current = {
      profile: { username: "test-cook" },
      status: "ready",
    };
    renderCloudDashboard(
      createCloudClient({ listPublicRepositories: vi.fn().mockResolvedValue([]) }),
    );

    await user.click(await screen.findByRole("button", { name: "New recipe" }));
    expect(window.location.pathname).toBe("/new");
  });

  it("aborts repository loading when the page unmounts", async () => {
    let signal: AbortSignal | undefined;
    let resolveRepositories: ((repositories: CloudRepository[]) => void) | undefined;
    const client = createCloudClient({
      listPublicRepositories: vi.fn().mockImplementation((requestSignal?: AbortSignal) => {
        signal = requestSignal;
        return new Promise<CloudRepository[]>((resolve) => {
          resolveRepositories = resolve;
        });
      }),
    });
    const { unmount } = renderCloudDashboard(client);

    await waitFor(() => expect(signal).toBeDefined());
    act(() => unmount());
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolveRepositories?.([repository]);
      await Promise.resolve();
    });
  });
});

function renderCloudDashboard(client: SeasoningBomApiClient) {
  return render(
    <CloudApiProvider client={client}>
      <DashboardPage />
    </CloudApiProvider>,
  );
}

function createCloudClient(overrides: Partial<SeasoningBomApiClient> = {}): SeasoningBomApiClient {
  return createCloudApiClientMock({
    listPublicRepositories: vi.fn().mockResolvedValue([]),
    ...overrides,
  });
}
