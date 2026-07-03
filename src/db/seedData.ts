import type { InventoryItem, RecipeComponent, RecipeRepositoryEntity } from "../domain";
import type { RepositorySet } from "../repositories/contracts";

export async function ensureSeedData(repositories: RepositorySet): Promise<void> {
  const existingRecipes = await repositories.recipes.findAll();
  const settings = await repositories.settings.get();

  if (existingRecipes.length > 0) {
    return;
  }

  const now = new Date();
  const timestamp = now.toISOString();
  await repositories.settings.save({ ...settings, updatedAt: timestamp });
  const recipes = createSeedRecipes(timestamp);
  const components = createSeedComponents();
  const inventoryItems = createSeedInventory(timestamp);

  for (const recipe of recipes) {
    await repositories.recipes.save(recipe);
    await repositories.components.saveMany(
      recipe.id,
      components.filter((component) => component.recipeId === recipe.id),
    );
  }

  for (const item of inventoryItems) {
    await repositories.inventory.save(item);
  }
}

function createSeedRecipes(timestamp: string): RecipeRepositoryEntity[] {
  return [
    {
      id: "recipe-curry-rice",
      ownerHandle: "me",
      name: "Curry Rice",
      slug: "curry-rice",
      description: "家庭用カレーライスの安定版レシピ。",
      visibility: "public",
      version: "1.2.0",
      servings: 4,
      tags: ["japanese", "eol-rescue", "weeknight"],
      license: "Mother's Taste License",
      maintainer: "me",
      readme:
        "# Curry Rice\n\n家庭用カレーライスの安定版レシピ。\n\n## Build\n\n1. Checkout ingredients.\n2. Install dependencies.\n3. Build curry base.\n4. Deploy to table.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "recipe-tofu-salad",
      ownerHandle: "me",
      name: "Tofu Salad",
      slug: "tofu-salad",
      description: "EOL 間近の豆腐を安全に使い切るための軽い副菜。",
      visibility: "public",
      version: "0.4.1",
      servings: 2,
      tags: ["quick", "vegetarian"],
      license: "MIT-Meal",
      maintainer: "me",
      readme:
        "# Tofu Salad\n\n豆腐、きゅうり、醤油ドレッシングの軽い副菜。\n\n## Build\n\n1. Drain tofu.\n2. Slice cucumber.\n3. Merge dressing branch.\n4. Serve cold.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}

function createSeedComponents(): RecipeComponent[] {
  return [
    {
      id: "component-curry-rice-rice",
      recipeId: "recipe-curry-rice",
      ingredientName: "rice",
      quantity: 2,
      unit: "go",
      dependencyType: "required",
      required: true,
      allergens: [],
      alternatives: [],
      transitiveDependencies: [],
    },
    {
      id: "component-curry-rice-roux",
      recipeId: "recipe-curry-rice",
      ingredientName: "curry-roux",
      quantity: 0.5,
      unit: "box",
      dependencyType: "required",
      required: true,
      allergens: [],
      alternatives: ["curry powder"],
      transitiveDependencies: [
        { name: "wheat", dependencyType: "transitive", allergens: ["wheat"] },
        { name: "milk", dependencyType: "transitive", allergens: ["milk"] },
        { name: "soy", dependencyType: "transitive", allergens: ["soy"] },
      ],
    },
    {
      id: "component-curry-rice-potato",
      recipeId: "recipe-curry-rice",
      ingredientName: "potato",
      quantity: 3,
      unit: "piece",
      dependencyType: "required",
      required: true,
      allergens: [],
      alternatives: ["sweet potato"],
      transitiveDependencies: [],
    },
    {
      id: "component-curry-rice-pork",
      recipeId: "recipe-curry-rice",
      ingredientName: "pork",
      quantity: 300,
      unit: "g",
      dependencyType: "optional",
      required: false,
      allergens: ["pork"],
      alternatives: ["tofu", "mushroom"],
      transitiveDependencies: [],
    },
    {
      id: "component-tofu-salad-tofu",
      recipeId: "recipe-tofu-salad",
      ingredientName: "tofu",
      quantity: 300,
      unit: "g",
      dependencyType: "required",
      required: true,
      allergens: ["soy"],
      alternatives: [],
      transitiveDependencies: [{ name: "soy", dependencyType: "transitive", allergens: ["soy"] }],
    },
    {
      id: "component-tofu-salad-cucumber",
      recipeId: "recipe-tofu-salad",
      ingredientName: "cucumber",
      quantity: 1,
      unit: "piece",
      dependencyType: "required",
      required: true,
      allergens: [],
      alternatives: ["lettuce"],
      transitiveDependencies: [],
    },
    {
      id: "component-tofu-salad-soy-sauce",
      recipeId: "recipe-tofu-salad",
      ingredientName: "soy sauce",
      quantity: 1,
      unit: "tbsp",
      dependencyType: "required",
      required: true,
      allergens: ["soy", "wheat"],
      alternatives: ["tamari"],
      transitiveDependencies: [
        { name: "soy", dependencyType: "transitive", allergens: ["soy"] },
        { name: "wheat", dependencyType: "transitive", allergens: ["wheat"] },
      ],
    },
  ];
}

function createSeedInventory(timestamp: string): InventoryItem[] {
  return [
    {
      id: "inventory-rice",
      name: "rice",
      category: "grain",
      quantity: 5,
      unit: "go",
      bestBeforeDate: dateKeyFromOffset(30),
      hazardous: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "inventory-curry-roux",
      name: "curry-roux",
      category: "pantry",
      quantity: 0.5,
      unit: "box",
      bestBeforeDate: dateKeyFromOffset(2),
      hazardous: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "inventory-potato",
      name: "potato",
      category: "produce",
      quantity: 2,
      unit: "piece",
      bestBeforeDate: dateKeyFromOffset(5),
      hazardous: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "inventory-tofu",
      name: "tofu",
      category: "prepared",
      quantity: 300,
      unit: "g",
      bestBeforeDate: dateKeyFromOffset(1),
      useByDate: dateKeyFromOffset(1),
      hazardous: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "inventory-cucumber",
      name: "cucumber",
      category: "produce",
      quantity: 1,
      unit: "piece",
      bestBeforeDate: dateKeyFromOffset(-1),
      hazardous: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "inventory-chicken",
      name: "chicken",
      category: "meat",
      quantity: 200,
      unit: "g",
      bestBeforeDate: dateKeyFromOffset(-2),
      useByDate: dateKeyFromOffset(-1),
      hazardous: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}

function dateKeyFromOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
