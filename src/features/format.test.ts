import { describe, expect, it, vi } from "vitest";
import { makeComponent, makeRecipe } from "../test/factories/domainFactories";
import {
  createId,
  fakeForks,
  fakeStars,
  formatQuantity,
  groupComponentsByRecipeId,
  groupIssuesBySeverity,
  slugify,
} from "./format";

describe("feature format helpers", () => {
  it("formats quantities and slugs for recipe-like labels", () => {
    expect(formatQuantity(2, "go")).toBe("2go");
    expect(formatQuantity(0, "as_needed")).toBe("as needed");
    expect(slugify(' Grandma\'s "Secret" Curry! ')).toBe("grandmas-secret-curry");
    expect(slugify("!!!")).toBe("recipe");
  });

  it("groups components and issues by their stable keys", () => {
    const component = makeComponent();
    expect(groupComponentsByRecipeId([component])).toEqual({ [component.recipeId]: [component] });

    const issue = {
      id: "issue-1",
      severity: "critical" as const,
      category: "unsupported" as const,
      message: "unsafe",
    };
    expect(groupIssuesBySeverity([issue]).critical).toEqual([issue]);
  });

  it("generates deterministic fake repository counters", () => {
    const recipe = makeRecipe({ name: "ABC", tags: ["a", "b"], version: "1.2.3" });
    expect(fakeStars(recipe, [makeComponent(), makeComponent({ id: "component-2" })])).toBe(23);
    expect(fakeForks(recipe)).toBe(6);
    expect(fakeForks(makeRecipe({ version: "" }))).toBe(1);
  });

  it("uses crypto UUIDs when available and falls back to Math.random", () => {
    const originalCrypto = globalThis.crypto;
    const originalRandom = Math.random;

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => "uuid-value" },
    });
    expect(createId("recipe")).toBe("recipe-uuid-value");

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(createId("recipe")).toBe("recipe-i");

    Math.random = originalRandom;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  });
});
