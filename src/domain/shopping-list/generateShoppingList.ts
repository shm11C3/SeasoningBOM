import type { AppSettings, InventoryItem } from "../inventory/types";
import { calculateLifecycleStatus } from "../lifecycle/calculateLifecycleStatus";
import type { RecipeComponent, Unit } from "../recipe/types";

export type ShoppingListItem = {
  ingredientName: string;
  requiredQuantity: number;
  availableQuantity: number;
  missingQuantity: number;
  unit: Unit;
  alternatives: string[];
  reason: "missing" | "insufficient";
  note?: string;
};

export type GenerateShoppingListInput = {
  components: RecipeComponent[];
  inventoryItems: InventoryItem[];
  now: Date;
  settings: AppSettings;
  includeOptional?: boolean;
};

export function generateShoppingList({
  components,
  inventoryItems,
  now,
  settings,
  includeOptional = false,
}: GenerateShoppingListInput): ShoppingListItem[] {
  const shoppingList: ShoppingListItem[] = [];

  for (const component of components) {
    if (!component.required && !includeOptional) {
      continue;
    }

    if (component.unit === "as_needed") {
      continue;
    }

    const matchingItems = inventoryItems.filter((item) =>
      sameIngredient(item.name, component.ingredientName),
    );
    const usableItems = matchingItems.filter((item) => {
      const status = calculateLifecycleStatus({
        item,
        now,
        deprecatedThresholdDays: settings.deprecatedThresholdDays,
      });
      return status !== "unsupported" && status !== "hazardous";
    });

    const sameUnitQuantity = usableItems
      .filter((item) => item.unit === component.unit)
      .reduce((total, item) => total + item.quantity, 0);

    if (sameUnitQuantity >= component.quantity) {
      continue;
    }

    const hasDifferentUnit = usableItems.length > 0 && sameUnitQuantity === 0;

    shoppingList.push({
      ingredientName: component.ingredientName,
      requiredQuantity: component.quantity,
      availableQuantity: sameUnitQuantity,
      missingQuantity: hasDifferentUnit
        ? component.quantity
        : component.quantity - sameUnitQuantity,
      unit: component.unit,
      alternatives: component.alternatives,
      reason: sameUnitQuantity === 0 ? "missing" : "insufficient",
      note: hasDifferentUnit
        ? "Available inventory uses a different unit, so SeasoningBOM treats the full amount as missing."
        : undefined,
    });
  }

  return shoppingList.toSorted((left, right) =>
    left.ingredientName.localeCompare(right.ingredientName),
  );
}

function sameIngredient(left: string, right: string): boolean {
  return (
    left.trim().toLowerCase().replace(/\s+/g, "-") ===
    right.trim().toLowerCase().replace(/\s+/g, "-")
  );
}
