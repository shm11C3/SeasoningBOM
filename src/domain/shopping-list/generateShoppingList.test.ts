import { describe, expect, it } from "vitest";
import {
  fixedNow,
  makeComponent,
  makeInventoryItem,
  makeSettings,
} from "../../test/factories/domainFactories";
import { generateShoppingList } from "./generateShoppingList";

describe("generateShoppingList", () => {
  it("excludes unsupported and hazardous inventory from availability", () => {
    const list = generateShoppingList({
      components: [makeComponent({ ingredientName: "chicken", quantity: 200, unit: "g" })],
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

    expect(list).toEqual([
      expect.objectContaining({
        ingredientName: "chicken",
        missingQuantity: 200,
        reason: "missing",
      }),
    ]);
  });

  it("calculates same-unit shortage", () => {
    const list = generateShoppingList({
      components: [makeComponent({ ingredientName: "potato", quantity: 3, unit: "piece" })],
      inventoryItems: [makeInventoryItem({ name: "potato", quantity: 1, unit: "piece" })],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(list[0]).toMatchObject({
      ingredientName: "potato",
      availableQuantity: 1,
      missingQuantity: 2,
      reason: "insufficient",
    });
  });

  it("skips optional and as-needed components by default", () => {
    const list = generateShoppingList({
      components: [
        makeComponent({
          id: "component-garnish",
          ingredientName: "garnish",
          dependencyType: "optional",
          required: false,
          quantity: 1,
          unit: "piece",
        }),
        makeComponent({
          id: "component-salt",
          ingredientName: "salt",
          quantity: 1,
          unit: "as_needed",
        }),
      ],
      inventoryItems: [],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(list).toEqual([]);
  });

  it("can include optional components and reports different-unit inventory notes", () => {
    const list = generateShoppingList({
      components: [
        makeComponent({
          ingredientName: "soy sauce",
          dependencyType: "optional",
          required: false,
          quantity: 1,
          unit: "tbsp",
          alternatives: ["tamari"],
        }),
      ],
      inventoryItems: [makeInventoryItem({ name: " soy   sauce ", quantity: 1, unit: "g" })],
      now: fixedNow,
      settings: makeSettings(),
      includeOptional: true,
    });

    expect(list).toEqual([
      expect.objectContaining({
        ingredientName: "soy sauce",
        missingQuantity: 1,
        alternatives: ["tamari"],
        reason: "missing",
        note: "Available inventory uses a different unit, so SeasoningBOM treats the full amount as missing.",
      }),
    ]);
  });

  it("skips components already covered by usable inventory", () => {
    const list = generateShoppingList({
      components: [makeComponent({ ingredientName: "rice", quantity: 2, unit: "go" })],
      inventoryItems: [makeInventoryItem({ name: "rice", quantity: 3, unit: "go" })],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(list).toEqual([]);
  });
});
