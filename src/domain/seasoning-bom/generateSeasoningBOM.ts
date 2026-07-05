import type { RecipeAlert } from "../audit/types";
import type { RecipeComponent, RecipeRepositoryEntity } from "../recipe/types";
import type { SeasoningBOM } from "./types";

export type GenerateSeasoningBOMInput = {
  recipe: RecipeRepositoryEntity;
  components: RecipeComponent[];
  recipeAlerts: RecipeAlert[];
  generatedAt: Date;
};

export function generateSeasoningBOM({
  recipe,
  components,
  recipeAlerts,
  generatedAt,
}: GenerateSeasoningBOMInput): SeasoningBOM {
  return {
    bomFormat: "SeasoningBOM",
    specVersion: "0.1.0",
    generatedAt: generatedAt.toISOString(),
    repository: {
      owner: recipe.ownerHandle,
      name: recipe.slug,
      version: recipe.version,
      visibility: recipe.visibility,
    },
    components: components.map((component) => ({
      name: component.ingredientName,
      quantity: component.quantity,
      unit: component.unit,
      dependencyType: component.dependencyType,
      required: component.required,
      allergens: component.allergens,
      dependencies: component.transitiveDependencies.map((dependency) => ({
        name: dependency.name,
        dependencyType: dependency.dependencyType,
        allergens: dependency.allergens,
        notes: dependency.notes,
      })),
    })),
    audit: {
      issues: recipeAlerts,
    },
  };
}
