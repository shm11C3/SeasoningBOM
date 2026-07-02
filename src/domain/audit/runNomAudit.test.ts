import { describe, expect, it } from "vitest";
import {
  fixedNow,
  makeComponent,
  makeInventoryItem,
  makeRecipe,
  makeSettings,
} from "../../test/factories/domainFactories";
import { runNomAudit } from "./runNomAudit";

describe("runNomAudit", () => {
  it("reports missing required dependencies as high severity", () => {
    const audit = runNomAudit({
      recipe: makeRecipe(),
      components: [makeComponent({ ingredientName: "rice" })],
      inventoryItems: [],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(audit.summary.high).toBe(1);
    expect(audit.issues[0]).toMatchObject({
      category: "missing",
      severity: "high",
      componentName: "rice",
    });
  });

  it("reports unsupported inventory as critical and unavailable", () => {
    const audit = runNomAudit({
      recipe: makeRecipe(),
      components: [makeComponent({ ingredientName: "chicken", quantity: 200, unit: "g" })],
      inventoryItems: [
        makeInventoryItem({
          id: "inventory-chicken",
          name: "chicken",
          quantity: 200,
          unit: "g",
          useByDate: "2026-06-30",
        }),
      ],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(audit.summary.critical).toBe(1);
    expect(audit.issues.some((issue) => issue.category === "unsupported")).toBe(true);
    expect(audit.issues.some((issue) => issue.category === "missing")).toBe(true);
  });

  it("adds transitive dependency allergen issues", () => {
    const audit = runNomAudit({
      recipe: makeRecipe(),
      components: [
        makeComponent({
          ingredientName: "curry-roux",
          quantity: 0.5,
          unit: "box",
          transitiveDependencies: [
            { name: "wheat", dependencyType: "transitive", allergens: ["wheat"] },
          ],
        }),
      ],
      inventoryItems: [makeInventoryItem({ name: "curry-roux", quantity: 0.5, unit: "box" })],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(audit.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "transitive-dependency",
          severity: "medium",
        }),
      ]),
    );
  });

  it("reports hazardous, EOL, allergens, licenses, and quantity issues conservatively", () => {
    const audit = runNomAudit({
      recipe: makeRecipe({ license: "Grandma Secret License" }),
      components: [
        makeComponent({
          id: "component-beef",
          ingredientName: "beef",
          quantity: 200,
          unit: "g",
          allergens: ["beef"],
        }),
        makeComponent({
          id: "component-potato",
          ingredientName: "potato",
          quantity: 3,
          unit: "piece",
        }),
        makeComponent({
          id: "component-salt",
          ingredientName: "salt",
          quantity: 1,
          unit: "as_needed",
        }),
        makeComponent({
          id: "component-garnish",
          ingredientName: "garnish",
          quantity: 1,
          unit: "piece",
          required: false,
          dependencyType: "optional",
          alternatives: ["parsley"],
          transitiveDependencies: [
            {
              name: "leafy-note",
              dependencyType: "transitive",
              allergens: [],
              notes: "Optional garnish metadata.",
            },
          ],
        }),
      ],
      inventoryItems: [
        makeInventoryItem({
          id: "inventory-beef",
          name: "beef",
          quantity: 200,
          unit: "g",
          hazardous: true,
        }),
        makeInventoryItem({
          id: "inventory-potato-bag",
          name: "potato",
          quantity: 1,
          unit: "g",
          bestBeforeDate: "2026-06-30",
        }),
        makeInventoryItem({
          id: "inventory-salt",
          name: "salt",
          quantity: 1,
          unit: "as_needed",
        }),
      ],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(audit.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "hazardous", severity: "critical" }),
        expect.objectContaining({ category: "allergen", severity: "medium" }),
        expect.objectContaining({ category: "license", severity: "low" }),
        expect.objectContaining({
          category: "transitive-dependency",
          severity: "low",
          recommendation: "Optional garnish metadata.",
        }),
        expect.objectContaining({
          category: "missing",
          message: "potato exists with a different unit, so quantity cannot be compared",
        }),
        expect.objectContaining({
          category: "missing",
          message: "garnish@1piece is missing",
          recommendation: "Try substitute dependency: parsley",
          severity: "low",
        }),
      ]),
    );
  });

  it("reports deprecated ingredients reaching EOL tomorrow and insufficient quantities", () => {
    const audit = runNomAudit({
      recipe: makeRecipe(),
      components: [
        makeComponent({
          ingredientName: "tofu",
          quantity: 300,
          unit: "g",
        }),
      ],
      inventoryItems: [
        makeInventoryItem({
          name: "tofu",
          quantity: 100,
          unit: "g",
          bestBeforeDate: "2026-07-02",
        }),
      ],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(audit.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "eol",
          message: "tofu will reach EOL tomorrow",
        }),
        expect.objectContaining({
          category: "missing",
          message: "tofu@300g is insufficient",
          recommendation: "200g must be added with nom install.",
        }),
      ]),
    );
  });

  it("reports optional insufficient quantities as low severity", () => {
    const audit = runNomAudit({
      recipe: makeRecipe(),
      components: [
        makeComponent({
          ingredientName: "parsley",
          dependencyType: "optional",
          required: false,
          quantity: 2,
          unit: "piece",
        }),
      ],
      inventoryItems: [makeInventoryItem({ name: "parsley", quantity: 1, unit: "piece" })],
      now: fixedNow,
      settings: makeSettings(),
    });

    expect(audit.issues).toEqual([
      expect.objectContaining({
        category: "missing",
        severity: "low",
        message: "parsley@2piece is insufficient",
      }),
    ]);
  });
});
