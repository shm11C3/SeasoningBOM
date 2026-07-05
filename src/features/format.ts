import type { AuditSeverity, RecipeComponent, RecipeRepositoryEntity } from "../domain";

export function formatQuantity(quantity: number, unit: string): string {
  return unit === "as_needed" ? "as needed" : `${quantity}${unit}`;
}

export function groupComponentsByRecipeId(
  components: RecipeComponent[],
): Record<string, RecipeComponent[]> {
  return components.reduce<Record<string, RecipeComponent[]>>((groups, component) => {
    groups[component.recipeId] ??= [];
    groups[component.recipeId].push(component);
    return groups;
  }, {});
}

export function groupIssuesBySeverity<T extends { severity: AuditSeverity }>(
  issues: T[],
): Record<AuditSeverity, T[]> {
  return issues.reduce<Record<AuditSeverity, T[]>>(
    (groups, issue) => {
      groups[issue.severity].push(issue);
      return groups;
    },
    { critical: [], high: [], medium: [], low: [] },
  );
}

export function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "recipe"
  );
}

export function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

export function fakeStars(recipe: RecipeRepositoryEntity, components: RecipeComponent[]): number {
  return recipe.name.length + components.length * 7 + recipe.tags.length * 3;
}

export function fakeForks(recipe: RecipeRepositoryEntity): number {
  return Math.max(
    1,
    recipe.version.split(".").reduce((total, part) => total + Number(part || 0), 0),
  );
}
