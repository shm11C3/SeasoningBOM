import type { AuditResult } from "../audit/types";
import type { AppSettings, InventoryItem } from "../inventory/types";
import { calculateLifecycleStatus } from "../lifecycle/calculateLifecycleStatus";
import type { RecipeComponent, RecipeRepositoryEntity } from "../recipe/types";
import type { SeasoningBOM } from "./types";

export type GenerateSeasoningBOMInput = {
  recipe: RecipeRepositoryEntity;
  components: RecipeComponent[];
  inventoryItems: InventoryItem[];
  audit: AuditResult;
  generatedAt: Date;
  settings: AppSettings;
};

export function generateSeasoningBOM({
  recipe,
  components,
  inventoryItems,
  audit,
  generatedAt,
  settings,
}: GenerateSeasoningBOMInput): SeasoningBOM {
  return {
    bomFormat: "SeasoningBOM",
    specVersion: "0.1.0",
    generatedAt: generatedAt.toISOString(),
    recipe: {
      name: recipe.slug,
      version: recipe.version,
      servings: recipe.servings,
    },
    components: components.map((component) => {
      const matchingInventory = inventoryItems.find((item) =>
        sameIngredient(item.name, component.ingredientName),
      );

      return {
        name: component.ingredientName,
        quantity: component.quantity,
        unit: component.unit,
        dependencyType: component.dependencyType,
        required: component.required,
        lifecycle: matchingInventory
          ? {
              eolDate: matchingInventory.bestBeforeDate,
              useByDate: matchingInventory.useByDate,
              status: calculateLifecycleStatus({
                item: matchingInventory,
                now: generatedAt,
                deprecatedThresholdDays: settings.deprecatedThresholdDays,
              }),
            }
          : undefined,
        allergens: component.allergens,
        dependencies: component.transitiveDependencies.map((dependency) => ({
          name: dependency.name,
          dependencyType: dependency.dependencyType,
          allergens: dependency.allergens,
          notes: dependency.notes,
        })),
      };
    }),
    audit: {
      summary: audit.summary,
      issues: audit.issues,
    },
  };
}

function sameIngredient(left: string, right: string): boolean {
  return (
    left.trim().toLowerCase().replace(/\s+/g, "-") ===
    right.trim().toLowerCase().replace(/\s+/g, "-")
  );
}
