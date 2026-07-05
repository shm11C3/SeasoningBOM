import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepositories } from "../repositories/memory/MemoryRepositories";
import { App } from "./App";
import { RepositoryProvider } from "./providers/RepositoryProvider";

const seedDataMock = vi.hoisted(() => ({
  ensureSeedData: vi.fn(),
}));

vi.mock("../db/seedData", () => ({
  ensureSeedData: seedDataMock.ensureSeedData,
}));

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

function renderApp(path = "/") {
  window.history.pushState({}, "", path);
  return render(
    <RepositoryProvider repositories={createMemoryRepositories()}>
      <App />
    </RepositoryProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    seedDataMock.ensureSeedData.mockReset();
    seedDataMock.ensureSeedData.mockResolvedValue(undefined);
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
    seedDataMock.ensureSeedData.mockRejectedValueOnce(error);

    renderApp("/");

    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
  });
});
