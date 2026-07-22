import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as seedData from "../db/seedData";
import type { SeasoningBomApiClient } from "../repositories/cloud-api/SeasoningBomApiClient";
import type { RepositorySet } from "../repositories/contracts";
import { createMemoryRepositories } from "../repositories/memory/MemoryRepositories";
import { App } from "./App";
import { CloudApiProvider } from "./providers/CloudApiProvider";
import { RepositoryProvider } from "./providers/RepositoryProvider";
import { navigate } from "./routes";

vi.mock("../features/recipes/DashboardPage", () => ({
  DashboardPage: () => "Dashboard route",
}));

vi.mock("../features/recipes/RecipeDetailPage", () => ({
  RecipeDetailPage: ({ ownerHandle, slug }: { ownerHandle: string; slug: string }) =>
    `Repository route: ${ownerHandle}/${slug}`,
}));

vi.mock("../features/recipes/RecipeEditorPage", () => ({
  RecipeEditorPage: ({ ownerHandle, slug }: { ownerHandle: string; slug: string }) =>
    `Repository editor route: ${ownerHandle}/${slug}`,
}));

vi.mock("../features/inventory/InventoryPage", () => ({
  InventoryPage: () => "Inventory route",
}));

vi.mock("../features/profile/ProfilePage", () => ({
  ProfilePage: ({ username }: { username: string }) => `Profile route: ${username}`,
}));

vi.mock("../features/audit/SecurityPage", () => ({
  SecurityPage: () => "Security route",
}));

vi.mock("../features/audit/EolDashboardPage", () => ({
  EolDashboardPage: () => "EOL route",
}));

vi.mock("../features/backup/BackupPage", () => ({
  BackupPage: () => "Backup route",
}));

function renderApp(
  path = "/",
  cloudApi: SeasoningBomApiClient | null = null,
  repositories: RepositorySet = createMemoryRepositories(),
) {
  window.history.pushState({}, "", path);
  return {
    ...render(
      <CloudApiProvider client={cloudApi}>
        <RepositoryProvider repositories={repositories}>
          <App />
        </RepositoryProvider>
      </CloudApiProvider>,
    ),
    repositories,
  };
}

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["/", "Dashboard route", "Repositories"],
    ["/me/curry-rice", "Repository route: me/curry-rice", null],
    ["/me/curry-rice/edit", "Repository editor route: me/curry-rice", null],
    ["/repositories/curry-rice", "Repository route: me/curry-rice", null],
    ["/repositories/curry-rice/edit", "Repository editor route: me/curry-rice", null],
    ["/new", "Repository editor route: me/new", null],
    ["/inventory", "Inventory route", "Inventory"],
    ["/security", "Security route", "Security"],
    ["/eol", "EOL route", "EOL"],
    ["/backup", "Backup route", "Backup"],
    ["/users/me", "Profile route: me", null],
  ])("renders %s", (path, routeText, activeNav) => {
    renderApp(path);

    expect(screen.getByText(routeText)).toBeInTheDocument();
    if (activeNav) {
      expect(screen.getByRole("link", { name: activeNav })).toHaveAttribute("aria-current", "page");
    } else {
      expect(screen.getByRole("link", { name: "Repositories" })).not.toHaveAttribute(
        "aria-current",
      );
    }
  });

  it("renders a not-found state for unknown paths", () => {
    renderApp("/elsewhere");

    expect(screen.getByText("Route not found")).toBeInTheDocument();
    expect(screen.getByText("/elsewhere")).toBeInTheDocument();
  });

  it.each([
    [new Error("seed failed"), "seed failed"],
    ["plain failure", "Seed data failed to initialize."],
  ])("renders seed initialization failures", async (error, message) => {
    vi.spyOn(seedData, "ensureSeedData").mockRejectedValueOnce(error);

    renderApp("/");

    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
  });

  it("does not seed local repositories for a cloud-backed profile route", async () => {
    const repositories = createMemoryRepositories();
    renderApp(
      "/users/test-cook",
      {
        getPublicProfile: vi.fn(),
        getUserContributionDay: vi.fn(),
        getUserContributions: vi.fn(),
        listPublicRepositories: vi.fn(),
      },
      repositories,
    );

    await waitFor(() => expect(screen.getByText("Profile route: test-cook")).toBeInTheDocument());
    await Promise.resolve();
    expect(await repositories.recipes.findAll()).toEqual([]);
  });

  it("seeds local repositories for routes that have not migrated to the cloud API", async () => {
    const repositories = createMemoryRepositories();
    renderApp(
      "/",
      {
        getPublicProfile: vi.fn(),
        getUserContributionDay: vi.fn(),
        getUserContributions: vi.fn(),
        listPublicRepositories: vi.fn(),
      },
      repositories,
    );

    await waitFor(async () => {
      await expect(repositories.recipes.findAll()).resolves.toHaveLength(2);
    });
    await expect(repositories.recipes.findById("recipe-curry-rice")).resolves.toMatchObject({
      ownerHandle: "me",
      slug: "curry-rice",
    });
  });

  it("ignores stale seed failures after navigating to a cloud-backed profile", async () => {
    let rejectSeed: ((reason: unknown) => void) | undefined;
    vi.spyOn(seedData, "ensureSeedData").mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSeed = reject;
        }),
    );
    renderApp("/", {
      getPublicProfile: vi.fn(),
      getUserContributionDay: vi.fn(),
      getUserContributions: vi.fn(),
      listPublicRepositories: vi.fn(),
    });

    await waitFor(() => expect(rejectSeed).toBeTypeOf("function"));
    act(() => navigate("/users/test-cook"));
    expect(screen.getByText("Profile route: test-cook")).toBeInTheDocument();

    await act(async () => {
      rejectSeed?.(new Error("stale seed failure"));
      await Promise.resolve();
    });

    expect(screen.queryByText("stale seed failure")).not.toBeInTheDocument();
  });
});
