import { describe, expect, it } from "vitest";
import {
  fixedNow,
  makeComponent,
  makeInventoryItem,
  makeRecipe,
  makeSettings,
} from "../../test/factories/domainFactories";
import { recommendRecipes } from "./recommendRecipes";

describe("recommendRecipes", () => {
  it("excludes recipes that rely on unsupported inventory", () => {
    const recipe = makeRecipe();
    const recommendations = recommendRecipes({
      recipes: [recipe],
      componentsByRecipeId: {
        [recipe.id]: [makeComponent({ ingredientName: "chicken", quantity: 200, unit: "g" })],
      },
      inventoryItems: [
        makeInventoryItem({
          name: "chicken",
          quantity: 200,
          unit: "g",
          useByDate: "2026-06-30",
        }),
      ],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(recommendations[0]).toMatchObject({
      recipeId: recipe.id,
      excluded: true,
    });
  });

  it("rewards recipes that use deprecated inventory", () => {
    const recipe = makeRecipe();
    const recommendations = recommendRecipes({
      recipes: [recipe],
      componentsByRecipeId: {
        [recipe.id]: [makeComponent({ ingredientName: "tofu", quantity: 300, unit: "g" })],
      },
      inventoryItems: [
        makeInventoryItem({
          name: "tofu",
          quantity: 300,
          unit: "g",
          bestBeforeDate: "2026-07-03",
        }),
      ],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(recommendations[0]).toMatchObject({
      excluded: false,
      score: 10,
    });
  });

  it("penalizes missing required dependencies and sorts usable recipes before excluded ones", () => {
    const missingRecipe = makeRecipe({ id: "recipe-missing", name: "Missing", slug: "missing" });
    const eolRecipe = makeRecipe({ id: "recipe-eol", name: "EOL", slug: "eol" });
    const excludedRecipe = makeRecipe({
      id: "recipe-unsupported",
      name: "Unsupported",
      slug: "unsupported",
    });

    const recommendations = recommendRecipes({
      recipes: [excludedRecipe, missingRecipe, eolRecipe],
      componentsByRecipeId: {
        [missingRecipe.id]: [
          makeComponent({
            id: "component-missing",
            recipeId: missingRecipe.id,
            ingredientName: "ginger",
          }),
        ],
        [eolRecipe.id]: [
          makeComponent({
            id: "component-eol",
            recipeId: eolRecipe.id,
            ingredientName: "tofu",
          }),
        ],
        [excludedRecipe.id]: [
          makeComponent({
            id: "component-unsupported",
            recipeId: excludedRecipe.id,
            ingredientName: "chicken",
          }),
        ],
      },
      inventoryItems: [
        makeInventoryItem({
          name: "tofu",
          bestBeforeDate: "2026-06-30",
        }),
        makeInventoryItem({
          name: "chicken",
          useByDate: "2026-06-30",
        }),
      ],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(recommendations.map((recommendation) => recommendation.recipeId)).toEqual([
      eolRecipe.id,
      missingRecipe.id,
      excludedRecipe.id,
    ]);
    expect(recommendations[0]).toMatchObject({ score: 3, excluded: false });
    expect(recommendations[1]).toMatchObject({ score: -20, excluded: false });
    expect(recommendations[2]).toMatchObject({
      excluded: true,
      exclusionReasons: ["chicken is unsupported"],
    });
  });

  it("treats whitespace-normalized ingredient names as the same dependency", () => {
    const recipe = makeRecipe();
    const recommendations = recommendRecipes({
      recipes: [recipe],
      componentsByRecipeId: {
        [recipe.id]: [makeComponent({ ingredientName: "soy sauce" })],
      },
      inventoryItems: [makeInventoryItem({ name: " soy   sauce ", bestBeforeDate: "2026-07-03" })],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(recommendations[0]).toMatchObject({
      excluded: false,
      score: 10,
    });
  });

  it("handles recipes with no component list and keeps excluded recipes after usable ones", () => {
    const bareRecipe = makeRecipe({ id: "recipe-bare", name: "Bare", slug: "bare" });
    const excludedRecipe = makeRecipe({ id: "recipe-bad", name: "Bad", slug: "bad" });

    const recommendations = recommendRecipes({
      recipes: [bareRecipe, excludedRecipe],
      componentsByRecipeId: {
        [excludedRecipe.id]: [
          makeComponent({ recipeId: excludedRecipe.id, ingredientName: "milk" }),
        ],
      },
      inventoryItems: [makeInventoryItem({ name: "milk", hazardous: true })],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(recommendations.map((recommendation) => recommendation.recipeId)).toEqual([
      bareRecipe.id,
      excludedRecipe.id,
    ]);
  });
});
