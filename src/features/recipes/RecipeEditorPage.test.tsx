import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudApiProvider } from "../../app/providers/CloudApiProvider";
import { CloudApiError } from "../../repositories/cloud-api/SeasoningBomApiClient";
import { createCloudApiClientMock } from "../../test/factories/cloudApiFactories";
import { makeComponent, makeRecipe } from "../../test/factories/domainFactories";
import { RecipeEditorPage } from "./RecipeEditorPage";

const liveDataMock = vi.hoisted(() => ({
  current: null as unknown,
}));
const cloudProfileMock = vi.hoisted(() => ({
  current: {
    profile: { username: "test-cook" },
    status: "ready",
  } as unknown,
}));

vi.mock("../useLiveData", () => ({
  useLiveData: () => liveDataMock.current,
}));

vi.mock("../../app/providers/CloudProfileProvider", () => ({
  useCloudProfile: () => cloudProfileMock.current,
}));

describe("RecipeEditorPage", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/new");
    cloudProfileMock.current = {
      profile: { username: "test-cook" },
      status: "ready",
    };
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

    render(<RecipeEditorPage ownerHandle="me" slug="new" />);

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
        ownerHandle: "me",
        servings: 4,
        slug: "test-curry",
        tags: ["quick", "safe"],
        visibility: "public",
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
    expect(window.location.pathname).toBe("/me/test-curry");
  }, 10_000);

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

    render(<RecipeEditorPage ownerHandle="me" slug="curry-rice" />);

    expect(await screen.findByDisplayValue("Curry Rice")).toBeInTheDocument();
    expect(screen.getByDisplayValue("soy")).toBeInTheDocument();
    expect(screen.getByDisplayValue("wheat: wheat")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add dependency" }));
    expect(screen.getAllByLabelText("Ingredient")).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "Remove dependency" })[1]);
    expect(screen.getAllByLabelText("Ingredient")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.location.pathname).toBe("/me/curry-rice");
  }, 10_000);

  it("shows not found for missing existing recipes", async () => {
    liveDataMock.current = {
      components: [],
      recipes: [],
      repositories: {
        components: { saveMany: vi.fn() },
        recipes: { save: vi.fn() },
      },
    };

    render(<RecipeEditorPage ownerHandle="me" slug="missing" />);

    await waitFor(() => expect(screen.getByText("Repository not found")).toBeInTheDocument());
  });

  it("creates a cloud repository and its dependency manifest", async () => {
    const user = userEvent.setup();
    const createRepository = vi.fn().mockResolvedValue({
      ownerHandle: "test-cook",
      slug: "cloud-curry",
    });
    const client = createCloudApiClientMock({ createRepository });

    render(
      <CloudApiProvider client={client}>
        <RecipeEditorPage ownerHandle="me" slug="new" />
      </CloudApiProvider>,
    );

    await user.type(screen.getByLabelText("Name"), "Cloud Curry");
    await user.type(screen.getByLabelText("Ingredient"), "rice");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(createRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        components: [expect.objectContaining({ ingredientName: "rice" })],
        name: "Cloud Curry",
        slug: "cloud-curry",
      }),
    );
    expect(window.location.pathname).toBe("/test-cook/cloud-curry");
    expect(screen.queryByLabelText("Maintainer")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tags")).not.toBeInTheDocument();
  });

  it("loads and atomically updates an owned cloud repository", async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({ ownerHandle: "test-cook" });
    const component = makeComponent({ recipeId: recipe.id });
    const updateRepository = vi.fn().mockResolvedValue({
      ...recipe,
      ownerHandle: "test-cook",
      version: "0.2.0",
    });
    const client = createCloudApiClientMock({
      getRepository: vi.fn().mockResolvedValue(recipe),
      getRepositoryDependencies: vi.fn().mockResolvedValue({
        components: [component],
        repository: recipe,
      }),
      updateRepository,
    });

    render(
      <CloudApiProvider client={client}>
        <RecipeEditorPage ownerHandle="test-cook" slug={recipe.slug} />
      </CloudApiProvider>,
    );

    await user.clear(await screen.findByLabelText("Version"));
    await user.type(screen.getByLabelText("Version"), "0.2.0");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateRepository).toHaveBeenCalledWith(
      "test-cook",
      recipe.slug,
      expect.objectContaining({
        components: [expect.objectContaining({ id: component.id })],
        version: "0.2.0",
      }),
    );
  });

  it("requires a signed-in cloud profile before editing", () => {
    cloudProfileMock.current = { profile: null, status: "signed-out" };

    render(
      <CloudApiProvider client={createCloudApiClientMock()}>
        <RecipeEditorPage ownerHandle="me" slug="new" />
      </CloudApiProvider>,
    );

    expect(screen.getByText("Sign in required")).toBeInTheDocument();
  });

  it("requires profile bootstrap and rejects editing another owner's repository", () => {
    const client = createCloudApiClientMock();
    cloudProfileMock.current = { profile: null, status: "needs-profile" };
    const { rerender } = render(
      <CloudApiProvider client={client}>
        <RecipeEditorPage ownerHandle="me" slug="new" />
      </CloudApiProvider>,
    );
    expect(screen.getByText("User Handle required")).toBeInTheDocument();

    cloudProfileMock.current = {
      profile: { username: "test-cook" },
      status: "ready",
    };
    rerender(
      <CloudApiProvider client={client}>
        <RecipeEditorPage ownerHandle="another-cook" slug="private-recipe" />
      </CloudApiProvider>,
    );
    expect(screen.getByText("Only the owner can edit this repository.")).toBeInTheDocument();
    expect(client.getRepository).not.toHaveBeenCalled();
  });

  it.each([
    [new CloudApiError(404, "Missing", "not_found"), "Repository not found"],
    [new Error("offline"), "Repository unavailable"],
  ])("shows bounded cloud load failures", async (failure, title) => {
    const client = createCloudApiClientMock({
      getRepository: vi.fn().mockRejectedValue(failure),
      getRepositoryDependencies: vi.fn().mockResolvedValue({ components: [] }),
    });

    render(
      <CloudApiProvider client={client}>
        <RecipeEditorPage ownerHandle="test-cook" slug="missing" />
      </CloudApiProvider>,
    );

    expect(await screen.findByText(title)).toBeInTheDocument();
  });

  it("keeps cloud save errors in the editor", async () => {
    const user = userEvent.setup();
    const client = createCloudApiClientMock({
      createRepository: vi.fn().mockRejectedValue(new Error("Save unavailable.")),
    });
    render(
      <CloudApiProvider client={client}>
        <RecipeEditorPage ownerHandle="me" slug="new" />
      </CloudApiProvider>,
    );

    await user.type(screen.getByLabelText("Name"), "Cloud Curry");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Save unavailable.")).toBeInTheDocument();
  });
});
