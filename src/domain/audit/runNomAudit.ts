import type { InventoryItem } from "../inventory/types";
import {
  calculateLifecycleStatus,
  daysUntilDateKey,
  toLocalDateKey,
} from "../lifecycle/calculateLifecycleStatus";
import type { LifecycleStatus } from "../lifecycle/types";
import type { RecipeComponent } from "../recipe/types";
import type {
  AuditIssue,
  AuditResult,
  AuditSeverity,
  InventoryAuditInput,
  InventoryAuditIssue,
  InventoryAuditResult,
  NomAuditInput,
  NomAuditResult,
  RecipeAlert,
  RecipeAlertInput,
} from "./types";

const severityWeight: Record<AuditSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function runNomAudit({
  recipe,
  components,
  inventoryItems,
  now,
  settings,
}: NomAuditInput): NomAuditResult {
  const recipeAlerts = generateRecipeAlerts({ recipe, components });
  const inventoryAudit = runInventoryAudit({ recipe, components, inventoryItems, now, settings });
  return {
    recipeId: recipe.id,
    generatedAt: now.toISOString(),
    recipeAlerts,
    inventoryAudit,
  };
}

export function toCombinedAuditResult(audit: NomAuditResult): AuditResult {
  const issues = [...audit.recipeAlerts, ...audit.inventoryAudit.issues].toSorted(
    (left, right) => severityWeight[right.severity] - severityWeight[left.severity],
  );
  return {
    recipeId: audit.recipeId,
    generatedAt: audit.generatedAt,
    summary: summarizeIssues(issues),
    issues,
  };
}

export function generateRecipeAlerts({ recipe, components }: RecipeAlertInput): RecipeAlert[] {
  const alerts: RecipeAlert[] = [];

  for (const component of components) {
    if (component.allergens.length > 0) {
      alerts.push(
        withRecipeAlertId(
          {
            severity: "medium",
            category: "allergen",
            componentName: component.ingredientName,
            message: `${component.ingredientName} declares allergen dependency: ${component.allergens.join(", ")}`,
            recommendation: "Check dietary constraints before cooking.",
          },
          alerts.length,
          recipe.id,
        ),
      );
    }

    for (const dependency of component.transitiveDependencies) {
      alerts.push(
        withRecipeAlertId(
          {
            severity: dependency.allergens.length > 0 ? "medium" : "low",
            category: "transitive-dependency",
            componentName: component.ingredientName,
            message: `${component.ingredientName} contains transitive dependency: ${dependency.name}`,
            recommendation: dependency.allergens.length
              ? `Contains allergen dependency: ${dependency.allergens.join(", ")}`
              : dependency.notes,
          },
          alerts.length,
          recipe.id,
        ),
      );
    }
  }

  if (recipe.license && /secret|mother|grandma/i.test(recipe.license)) {
    alerts.push(
      withRecipeAlertId(
        {
          severity: "low",
          category: "license",
          message: `${recipe.license} is recipe metadata, not an OSS license`,
          recommendation: "Treat joke recipe licenses as notes only.",
        },
        alerts.length,
        recipe.id,
      ),
    );
  }

  return sortIssues(alerts);
}

export function runInventoryAudit({
  recipe,
  components,
  inventoryItems,
  now,
  settings,
}: InventoryAuditInput): InventoryAuditResult {
  const today = toLocalDateKey(now);
  const issues: InventoryAuditIssue[] = [];

  for (const component of components) {
    const matchingItems = inventoryItems.filter((item) =>
      sameIngredient(item.name, component.ingredientName),
    );

    for (const item of matchingItems) {
      const status = calculateLifecycleStatus({
        item,
        now,
        deprecatedThresholdDays: settings.deprecatedThresholdDays,
      });
      const lifecycleIssue = createLifecycleIssue(component, item, status, today);
      if (lifecycleIssue) {
        issues.push(withId(lifecycleIssue, issues.length, recipe.id));
      }
    }

    const usableMatchingItems = matchingItems.filter((item) => {
      const status = calculateLifecycleStatus({
        item,
        now,
        deprecatedThresholdDays: settings.deprecatedThresholdDays,
      });
      return status !== "unsupported" && status !== "hazardous";
    });

    if (usableMatchingItems.length === 0) {
      issues.push(
        withId(
          {
            severity: component.required ? "high" : "low",
            category: "missing",
            componentName: component.ingredientName,
            message: `${component.ingredientName}@${component.quantity}${component.unit} is missing`,
            recommendation: component.alternatives.length
              ? `Try substitute dependency: ${component.alternatives.join(", ")}`
              : undefined,
          },
          issues.length,
          recipe.id,
        ),
      );
    } else {
      const quantityIssue = createQuantityIssue(component, usableMatchingItems);
      if (quantityIssue) {
        issues.push(withInventoryIssueId(quantityIssue, issues.length, recipe.id));
      }
    }
  }

  const sortedIssues = sortIssues(issues);

  return {
    recipeId: recipe.id,
    generatedAt: now.toISOString(),
    summary: summarizeIssues(sortedIssues),
    issues: sortedIssues,
  };
}

export function summarizeIssues(issues: { severity: AuditSeverity }[]): AuditResult["summary"] {
  return issues.reduce(
    (summary, issue) => {
      summary.totalIssues += 1;
      summary[issue.severity] += 1;
      return summary;
    },
    { totalIssues: 0, critical: 0, high: 0, medium: 0, low: 0 },
  );
}

function createLifecycleIssue(
  component: RecipeComponent,
  inventoryItem: InventoryItem,
  status: LifecycleStatus,
  today: string,
): Omit<InventoryAuditIssue, "id"> | null {
  switch (status) {
    case "deprecated": {
      const days = daysUntilDateKey(inventoryItem.bestBeforeDate, today);
      return {
        severity: "medium",
        category: "eol",
        componentName: component.ingredientName,
        inventoryItemId: inventoryItem.id,
        message:
          days === 1
            ? `${component.ingredientName} will reach EOL tomorrow`
            : `${component.ingredientName} is approaching EOL`,
        recommendation: "Prioritize this ingredient soon.",
      };
    }
    case "eol":
      return {
        severity: "high",
        category: "eol",
        componentName: component.ingredientName,
        inventoryItemId: inventoryItem.id,
        message: `${component.ingredientName} has reached EOL`,
        recommendation: "Inspect before use and prefer safer alternatives when uncertain.",
      };
    case "unsupported":
      return {
        severity: "critical",
        category: "unsupported",
        componentName: component.ingredientName,
        inventoryItemId: inventoryItem.id,
        message: `${component.ingredientName} is unsupported and excluded from recommendations`,
        recommendation: "Do not use this inventory item.",
      };
    case "hazardous":
      return {
        severity: "critical",
        category: "hazardous",
        componentName: component.ingredientName,
        inventoryItemId: inventoryItem.id,
        message: `${component.ingredientName} is hazardous and treated as unavailable`,
        recommendation: "Remove or replace this inventory item.",
      };
    case "active":
      return null;
  }
}

function createQuantityIssue(
  component: RecipeComponent,
  matchingItems: { quantity: number; unit: string }[],
): Omit<InventoryAuditIssue, "id"> | null {
  if (component.unit === "as_needed") {
    return null;
  }

  const sameUnitQuantity = matchingItems
    .filter((item) => item.unit === component.unit)
    .reduce((total, item) => total + item.quantity, 0);

  if (sameUnitQuantity >= component.quantity) {
    return null;
  }

  if (sameUnitQuantity === 0) {
    return {
      severity: "low",
      category: "quantity",
      componentName: component.ingredientName,
      message: `${component.ingredientName} exists with a different unit, so quantity cannot be compared`,
      recommendation: "Check the package manually or add the item with a matching unit.",
    };
  }

  return {
    severity: component.required ? "high" : "low",
    category: "quantity",
    componentName: component.ingredientName,
    message: `${component.ingredientName}@${component.quantity}${component.unit} is insufficient`,
    recommendation: `${component.quantity - sameUnitQuantity}${component.unit} must be added with nom install.`,
  };
}

function sortIssues<T extends { severity: AuditSeverity }>(issues: T[]): T[] {
  return issues.toSorted(
    (left, right) => severityWeight[right.severity] - severityWeight[left.severity],
  );
}

function withRecipeAlertId(
  issue: Omit<RecipeAlert, "id">,
  index: number,
  recipeId: string,
): RecipeAlert {
  return {
    id: issueId(recipeId, issue, index),
    ...issue,
  };
}

function withInventoryIssueId(
  issue: Omit<InventoryAuditIssue, "id">,
  index: number,
  recipeId: string,
): InventoryAuditIssue {
  return {
    id: issueId(recipeId, issue, index),
    ...issue,
  };
}

function withId(
  issue: Omit<InventoryAuditIssue, "id">,
  index: number,
  recipeId: string,
): InventoryAuditIssue {
  return withInventoryIssueId(issue, index, recipeId);
}

function issueId(
  recipeId: string,
  issue: Pick<AuditIssue, "category" | "severity" | "componentName">,
  index: number,
): string {
  const parts = [recipeId, issue.category, issue.severity, issue.componentName, index]
    .filter(Boolean)
    .join("-");
  return parts.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function sameIngredient(left: string, right: string): boolean {
  return normalizeIngredientName(left) === normalizeIngredientName(right);
}

function normalizeIngredientName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}
