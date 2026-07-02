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
  RecipeDetailPage: ({ slug }: { slug: string }) => `Repository route: ${slug}`,
}));

vi.mock("../features/recipes/RecipeEditorPage", () => ({
  RecipeEditorPage: ({ slug }: { slug: string }) => `Repository editor route: ${slug}`,
}));

vi.mock("../features/inventory/InventoryPage", () => ({
  InventoryPage: () => "Inventory route",
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
    ["/repositories/curry-rice", "Repository route: curry-rice", null],
    ["/repositories/curry-rice/edit", "Repository editor route: curry-rice", null],
    ["/inventory", "Inventory route", "Inventory"],
    ["/security", "Security route", "Security"],
    ["/eol", "EOL route", "EOL"],
    ["/backup", "Backup route", "Backup"],
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
