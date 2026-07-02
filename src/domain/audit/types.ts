import type { AppSettings, InventoryItem } from "../inventory/types";
import type { RecipeComponent, RecipeRepositoryEntity } from "../recipe/types";

export type AuditSeverity = "low" | "medium" | "high" | "critical";

export type AuditCategory =
  | "eol"
  | "unsupported"
  | "hazardous"
  | "allergen"
  | "missing"
  | "transitive-dependency"
  | "substitute"
  | "license";

export type AuditIssue = {
  id: string;
  severity: AuditSeverity;
  category: AuditCategory;
  componentName?: string;
  inventoryItemId?: string;
  message: string;
  recommendation?: string;
};

export type AuditSummary = {
  totalIssues: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
};

export type AuditResult = {
  recipeId: string;
  generatedAt: string;
  summary: AuditSummary;
  issues: AuditIssue[];
};

export type NomAuditInput = {
  recipe: RecipeRepositoryEntity;
  components: RecipeComponent[];
  inventoryItems: InventoryItem[];
  now: Date;
  settings: AppSettings;
};
