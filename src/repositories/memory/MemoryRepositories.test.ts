import { describe, expect, it } from "vitest";
import {
  makeComponent,
  makeInventoryItem,
  makeRecipe,
  makeSettings,
} from "../../test/factories/domainFactories";
import { createMemoryRepositories } from "./MemoryRepositories";

describe("Memory repositories", () => {
  it("stores, sorts, finds, and deletes recipe repositories", async () => {
    const repositories = createMemoryRepositories();
    const curry = makeRecipe({ id: "recipe-curry", name: "Curry Rice", slug: "curry-rice" });
    const salad = makeRecipe({ id: "recipe-salad", name: "Apple Salad", slug: "apple-salad" });

    await repositories.recipes.save(curry);
    await repositories.recipes.save(salad);

    await expect(repositories.recipes.findAll()).resolves.toEqual([salad, curry]);
    await expect(repositories.recipes.findById(curry.id)).resolves.toEqual(curry);
    await expect(repositories.recipes.findBySlug(salad.slug)).resolves.toEqual(salad);

    await repositories.recipes.delete(curry.id);

    await expect(repositories.recipes.findById(curry.id)).resolves.toBeNull();
    await expect(repositories.recipes.findBySlug(curry.slug)).resolves.toBeNull();
  });

  it("replaces components for one recipe without touching another recipe", async () => {
    const repositories = createMemoryRepositories();
    const oldRice = makeComponent({ id: "component-old-rice", recipeId: "recipe-curry" });
    const otherRecipeRice = makeComponent({
      id: "component-other-rice",
      recipeId: "recipe-other",
      ingredientName: "apple",
    });
    const newPotato = makeComponent({
      id: "component-new-potato",
      recipeId: "recipe-curry",
      ingredientName: "potato",
    });

    await repositories.components.saveMany("recipe-curry", [oldRice]);
    await repositories.components.saveMany("recipe-other", [otherRecipeRice]);
    await repositories.components.saveMany("recipe-curry", [newPotato]);

    await expect(repositories.components.findByRecipeId("recipe-curry")).resolves.toEqual([
      newPotato,
    ]);
    await expect(repositories.components.findAll()).resolves.toEqual([otherRecipeRice, newPotato]);

    await repositories.components.deleteByRecipeId("recipe-curry");

    await expect(repositories.components.findByRecipeId("recipe-curry")).resolves.toEqual([]);
    await expect(repositories.components.findByRecipeId("recipe-other")).resolves.toEqual([
      otherRecipeRice,
    ]);
  });

  it("stores, sorts, finds, and deletes inventory items", async () => {
    const repositories = createMemoryRepositories();
    const rice = makeInventoryItem({ id: "inventory-rice", name: "Rice" });
    const apple = makeInventoryItem({ id: "inventory-apple", name: "apple" });

    await repositories.inventory.save(rice);
    await repositories.inventory.save(apple);

    await expect(repositories.inventory.findAll()).resolves.toEqual([apple, rice]);
    await expect(repositories.inventory.findById(rice.id)).resolves.toEqual(rice);
    await expect(repositories.inventory.findByName("rice")).resolves.toEqual([rice]);

    await repositories.inventory.delete(rice.id);

    await expect(repositories.inventory.findById(rice.id)).resolves.toBeNull();
    await expect(repositories.inventory.findByName("rice")).resolves.toEqual([]);
  });

  it("persists settings", async () => {
    const repositories = createMemoryRepositories();
    const settings = makeSettings({ deprecatedThresholdDays: 1 });

    await repositories.settings.save(settings);

    await expect(repositories.settings.get()).resolves.toEqual(settings);
  });
});

describe("MemoryBackupRepository", () => {
  it("round-trips repositories, components, and inventory items", async () => {
    const source = createMemoryRepositories();
    const recipe = makeRecipe();
    const component = makeComponent();
    const inventoryItem = makeInventoryItem();

    await source.recipes.save(recipe);
    await source.components.saveMany(recipe.id, [component]);
    await source.inventory.save(inventoryItem);

    const backup = await source.backup.exportAll();
    const target = createMemoryRepositories();
    const result = await target.backup.importAll(backup, { conflictStrategy: "overwrite" });

    expect(result).toMatchObject({
      importedRepositories: 1,
      importedComponents: 1,
      importedInventoryItems: 1,
    });
    await expect(target.recipes.findBySlug(recipe.slug)).resolves.toMatchObject({ id: recipe.id });
    await expect(target.components.findByRecipeId(recipe.id)).resolves.toHaveLength(1);
    await expect(target.inventory.findByName(inventoryItem.name)).resolves.toHaveLength(1);
  });
});
