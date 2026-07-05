import type {
  AppSettings,
  InventoryItem,
  RecipeComponent,
  RecipeRepositoryEntity,
} from "../../domain";
import { defaultSettings } from "../../domain";

export const fixedNow = new Date("2026-07-01T12:00:00Z");

export function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    ...defaultSettings,
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeInventoryItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "inventory-rice",
    name: "rice",
    category: "grain",
    quantity: 2,
    unit: "go",
    bestBeforeDate: "2026-07-10",
    hazardous: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeRecipe(
  overrides: Partial<RecipeRepositoryEntity> = {},
): RecipeRepositoryEntity {
  return {
    id: "recipe-curry",
    ownerHandle: "me",
    name: "Curry Rice",
    slug: "curry-rice",
    description: "Stable curry recipe.",
    visibility: "public",
    version: "1.2.0",
    servings: 4,
    tags: ["japanese"],
    license: "MIT-Meal",
    maintainer: "me",
    readme: "# Curry Rice",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeComponent(overrides: Partial<RecipeComponent> = {}): RecipeComponent {
  return {
    id: "component-rice",
    recipeId: "recipe-curry",
    ingredientName: "rice",
    quantity: 2,
    unit: "go",
    dependencyType: "required",
    required: true,
    allergens: [],
    alternatives: [],
    transitiveDependencies: [],
    ...overrides,
  };
}
