import { describe, expect, it } from "vitest";
import {
  fixedNow,
  makeComponent,
  makeInventoryItem,
  makeRecipe,
  makeSettings,
} from "../../test/factories/domainFactories";
import { runNomAudit } from "../audit/runNomAudit";
import { generateSeasoningBOM } from "./generateSeasoningBOM";

describe("generateSeasoningBOM", () => {
  it("generates a SeasoningBOM snapshot with lifecycle and audit data", () => {
    const recipe = makeRecipe();
    const components = [
      makeComponent({
        transitiveDependencies: [
          { name: "wheat", dependencyType: "transitive", allergens: ["wheat"] },
        ],
      }),
    ];
    const inventoryItems = [makeInventoryItem({ bestBeforeDate: "2026-07-04" })];
    const settings = makeSettings();
    const audit = runNomAudit({ recipe, components, inventoryItems, now: fixedNow, settings });

    const bom = generateSeasoningBOM({
      recipe,
      components,
      inventoryItems,
      audit,
      generatedAt: fixedNow,
      settings,
    });

    expect(bom).toMatchObject({
      bomFormat: "SeasoningBOM",
      specVersion: "0.1.0",
      recipe: {
        name: "curry-rice",
        version: "1.2.0",
      },
      components: [
        expect.objectContaining({
          name: "rice",
          lifecycle: expect.objectContaining({ status: "deprecated" }),
          dependencies: [expect.objectContaining({ name: "wheat" })],
        }),
      ],
      audit: expect.objectContaining({
        summary: expect.objectContaining({ totalIssues: expect.any(Number) }),
      }),
    });
  });

  it("omits lifecycle data when no matching inventory item exists", () => {
    const recipe = makeRecipe();
    const component = makeComponent({ ingredientName: "soy sauce" });
    const settings = makeSettings();
    const audit = runNomAudit({
      recipe,
      components: [component],
      inventoryItems: [],
      now: fixedNow,
      settings,
    });

    const bom = generateSeasoningBOM({
      recipe,
      components: [component],
      inventoryItems: [makeInventoryItem({ name: "tamari" })],
      audit,
      generatedAt: fixedNow,
      settings,
    });

    expect(bom.components[0].lifecycle).toBeUndefined();
  });
});
