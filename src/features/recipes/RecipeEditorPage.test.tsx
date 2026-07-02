import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeComponent, makeRecipe } from "../../test/factories/domainFactories";
import { RecipeEditorPage } from "./RecipeEditorPage";

const liveDataMock = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("../useLiveData", () => ({
  useLiveData: () => liveDataMock.current,
}));

describe("RecipeEditorPage", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/repositories/new/edit");
  });

  it("validates and saves a new recipe with parsed dependencies", async () => {
    const user = userEvent.setup();
    const saveRecipe = vi.fn().mockResolvedValue(undefined);
    const saveMany = vi.fn().mockResolvedValue(undefined);
    liveDataMock.current = {
      components: [],
      recipes: [],
      repositories: {
        components: { saveMany },
        recipes: { save: saveRecipe },
      },
    };

    render(<RecipeEditorPage slug="new" />);

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Recipe name is required.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Name"), "Test Curry");
    await user.clear(screen.getByLabelText("Slug"));
    await user.type(screen.getByLabelText("Slug"), "test-curry");
    await user.type(screen.getByLabelText("Description"), "Safe weeknight curry");
    await user.clear(screen.getByLabelText("Servings"));
    await user.type(screen.getByLabelText("Servings"), "4");
    await user.type(screen.getByLabelText("Tags"), "quick, safe");
    await user.type(screen.getByLabelText("Ingredient"), "rice");
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "2");
    await user.selectOptions(screen.getByLabelText("Unit"), "go");
    await user.selectOptions(screen.getByLabelText("Type"), "optional");
    await user.selectOptions(screen.getByLabelText("Required"), "no");
    await user.type(screen.getByLabelText("Allergens"), "wheat, unknown");
    await user.type(screen.getByLabelText("Alternatives"), "bread, noodles");
    await user.type(screen.getByLabelText("Notes"), "cook fully");
    await user.type(screen.getByLabelText("Transitive dependencies"), "soy: soy\nsalt:");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(saveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Safe weeknight curry",
        name: "Test Curry",
        servings: 4,
        slug: "test-curry",
        tags: ["quick", "safe"],
      }),
    );
    expect(saveMany).toHaveBeenCalledWith(expect.any(String), [
      expect.objectContaining({
        allergens: ["wheat"],
        alternatives: ["bread", "noodles"],
        dependencyType: "optional",
        ingredientName: "rice",
        notes: "cook fully",
        required: false,
        transitiveDependencies: [
          { allergens: ["soy"], dependencyType: "transitive", name: "soy" },
          { allergens: [], dependencyType: "transitive", name: "salt" },
        ],
      }),
    ]);
    expect(window.location.pathname).toBe("/repositories/test-curry");
  });

  it("loads, edits, removes dependencies, and cancels existing recipes", async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe();
    const component = makeComponent({
      allergens: ["soy"],
      alternatives: ["barley"],
      notes: "optional note",
      transitiveDependencies: [
        { allergens: ["wheat"], dependencyType: "transitive", name: "wheat" },
      ],
    });
    liveDataMock.current = {
      components: [component],
      recipes: [recipe],
      repositories: {
        components: { saveMany: vi.fn() },
        recipes: { save: vi.fn() },
      },
    };

    render(<RecipeEditorPage slug="curry-rice" />);

    expect(await screen.findByDisplayValue("Curry Rice")).toBeInTheDocument();
    expect(screen.getByDisplayValue("soy")).toBeInTheDocument();
    expect(screen.getByDisplayValue("wheat: wheat")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add dependency" }));
    expect(screen.getAllByLabelText("Ingredient")).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "Remove dependency" })[1]);
    expect(screen.getAllByLabelText("Ingredient")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.location.pathname).toBe("/repositories/curry-rice");
  });

  it("shows not found for missing existing recipes", async () => {
    liveDataMock.current = {
      components: [],
      recipes: [],
      repositories: {
        components: { saveMany: vi.fn() },
        recipes: { save: vi.fn() },
      },
    };

    render(<RecipeEditorPage slug="missing" />);

    await waitFor(() => expect(screen.getByText("Repository not found")).toBeInTheDocument());
  });
});
