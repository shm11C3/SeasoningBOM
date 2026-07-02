import type { AppSettings, InventoryItem } from "../inventory/types";
import { calculateLifecycleStatus } from "../lifecycle/calculateLifecycleStatus";
import type { RecipeComponent, RecipeRepositoryEntity } from "../recipe/types";

export type RecipeRecommendation = {
  recipeId: string;
  score: number;
  matchedDeprecatedItems: InventoryItem[];
  excluded: boolean;
  exclusionReasons: string[];
};

export type RecommendRecipesInput = {
  recipes: RecipeRepositoryEntity[];
  componentsByRecipeId: Record<string, RecipeComponent[]>;
  inventoryItems: InventoryItem[];
  now: Date;
  settings: AppSettings;
};

export function recommendRecipes({
  recipes,
  componentsByRecipeId,
  inventoryItems,
  now,
  settings,
}: RecommendRecipesInput): RecipeRecommendation[] {
  return recipes
    .map((recipe) => {
      const components = componentsByRecipeId[recipe.id] ?? [];
      let score = 0;
      const matchedDeprecatedItems: InventoryItem[] = [];
      const exclusionReasons: string[] = [];

      for (const component of components) {
        const matchingItems = inventoryItems.filter((item) =>
          sameIngredient(item.name, component.ingredientName),
        );

        if (component.required && matchingItems.length === 0) {
          score -= 20;
          continue;
        }

        for (const item of matchingItems) {
          const status = calculateLifecycleStatus({
            item,
            now,
            deprecatedThresholdDays: settings.deprecatedThresholdDays,
          });

          if (status === "unsupported" || status === "hazardous") {
            exclusionReasons.push(`${component.ingredientName} is ${status}`);
          }

          if (status === "deprecated") {
            score += 10;
            matchedDeprecatedItems.push(item);
          }

          if (status === "eol") {
            score += 3;
          }
        }
      }

      return {
        recipeId: recipe.id,
        score,
        matchedDeprecatedItems,
        excluded: exclusionReasons.length > 0,
        exclusionReasons,
      };
    })
    .toSorted((left, right) => {
      if (left.excluded !== right.excluded) {
        return left.excluded ? 1 : -1;
      }
      return right.score - left.score;
    });
}

function sameIngredient(left: string, right: string): boolean {
  return (
    left.trim().toLowerCase().replace(/\s+/g, "-") ===
    right.trim().toLowerCase().replace(/\s+/g, "-")
  );
}
