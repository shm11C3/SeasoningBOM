export type Unit =
  | "g"
  | "kg"
  | "ml"
  | "l"
  | "piece"
  | "pack"
  | "box"
  | "tbsp"
  | "tsp"
  | "cup"
  | "go"
  | "pinch"
  | "as_needed";

export type Allergen =
  | "egg"
  | "milk"
  | "wheat"
  | "buckwheat"
  | "peanut"
  | "shrimp"
  | "crab"
  | "soy"
  | "beef"
  | "pork"
  | "chicken"
  | "fish"
  | "other";

export type DependencyType = "required" | "optional" | "dev" | "peer" | "transitive" | "substitute";

export type IngredientDependencyType = "transitive" | "substitute" | "peer";

export type IngredientDependency = {
  name: string;
  dependencyType: IngredientDependencyType;
  allergens: Allergen[];
  notes?: string;
};

export type RecipeRepositoryEntity = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  version: string;
  servings: number;
  tags: string[];
  license?: string;
  maintainer?: string;
  readme?: string;
  createdAt: string;
  updatedAt: string;
};

export type RecipeComponent = {
  id: string;
  recipeId: string;
  ingredientName: string;
  quantity: number;
  unit: Unit;
  dependencyType: DependencyType;
  required: boolean;
  allergens: Allergen[];
  alternatives: string[];
  transitiveDependencies: IngredientDependency[];
  notes?: string;
};

export const units: Unit[] = [
  "g",
  "kg",
  "ml",
  "l",
  "piece",
  "pack",
  "box",
  "tbsp",
  "tsp",
  "cup",
  "go",
  "pinch",
  "as_needed",
];

export const allergens: Allergen[] = [
  "egg",
  "milk",
  "wheat",
  "buckwheat",
  "peanut",
  "shrimp",
  "crab",
  "soy",
  "beef",
  "pork",
  "chicken",
  "fish",
  "other",
];

export const dependencyTypes: DependencyType[] = [
  "required",
  "optional",
  "dev",
  "peer",
  "transitive",
  "substitute",
];
