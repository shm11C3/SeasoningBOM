import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeComponent,
  makeInventoryItem,
  makeRecipe,
  makeSettings,
} from "../../test/factories/domainFactories";
import { RecipeDetailPage } from "./RecipeDetailPage";

const liveDataMock = vi.hoisted(() => ({
  current: null as unknown,
}));
const downloadJsonMock = vi.hoisted(() => vi.fn());

vi.mock("../download", () => ({
  downloadJson: downloadJsonMock,
}));

vi.mock("../useLiveData", () => ({
  useLiveData: () => liveDataMock.current,
}));

describe("RecipeDetailPage", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/repositories/curry-rice");
  });

  it("renders code, dependency, and security views for a repository", async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({
      readme: "# Curry Rice\n\n## Build\n\n1. Cook rice\nServe.",
      tags: ["japanese", "quick"],
    });
    const components = [
      makeComponent({
        allergens: ["wheat"],
        alternatives: ["brown rice"],
        ingredientName: "rice",
        transitiveDependencies: [{ allergens: ["soy"], dependencyType: "transitive", name: "soy" }],
      }),
    ];
    liveDataMock.current = {
      components,
      inventoryItems: [makeInventoryItem({ bestBeforeDate: "2026-07-01", name: "rice" })],
      recipes: [recipe],
      repositories: {
        recipes: {
          delete: vi.fn(),
        },
      },
      settings: makeSettings(),
    };

    render(<RecipeDetailPage slug="curry-rice" />);

    expect(screen.getByRole("heading", { name: "Curry Rice" })).toBeInTheDocument();
    expect(screen.getByText("nom audit found 3 issues.")).toBeInTheDocument();
    expect(screen.getByText("All required dependencies are installed.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Dependencies" }));
    expect(screen.getByText("Allergens: wheat")).toBeInTheDocument();
    expect(screen.getByText(/soy/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Security" }));
    expect(screen.getByRole("heading", { name: "Security alerts" })).toBeInTheDocument();
    expect(screen.getByText("rice has reached EOL")).toBeInTheDocument();
  });

  it("downloads a SeasoningBOM and deletes a repository", async () => {
    const user = userEvent.setup();
    const deleteRecipe = vi.fn().mockResolvedValue(undefined);
    liveDataMock.current = {
      components: [makeComponent()],
      inventoryItems: [makeInventoryItem()],
      recipes: [makeRecipe()],
      repositories: {
        recipes: {
          delete: deleteRecipe,
        },
      },
      settings: makeSettings(),
    };

    render(<RecipeDetailPage slug="curry-rice" />);

    await user.click(screen.getByRole("button", { name: "Download SBOM" }));
    expect(downloadJsonMock).toHaveBeenCalledWith(
      "curry-rice-seasoningbom.json",
      expect.objectContaining({ bomFormat: "SeasoningBOM" }),
    );
    expect(screen.getByText("SeasoningBOM JSON downloaded.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteRecipe).toHaveBeenCalledWith("recipe-curry"));
    expect(window.location.pathname).toBe("/");
  });

  it("renders empty repository detail states", () => {
    liveDataMock.current = {
      components: [],
      inventoryItems: [],
      recipes: [makeRecipe({ readme: undefined })],
      repositories: { recipes: { delete: vi.fn() } },
      settings: makeSettings(),
    };

    render(<RecipeDetailPage slug="missing" />);
    expect(screen.getByText("Repository not found")).toBeInTheDocument();
  });
});
