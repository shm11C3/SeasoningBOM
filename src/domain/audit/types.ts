import type { AppSettings, InventoryItem } from "../inventory/types";
import type { RecipeComponent, RecipeRepositoryEntity } from "../recipe/types";

export type AuditSeverity = "low" | "medium" | "high" | "critical";

export type RecipeAlertCategory =
  | "allergen"
  | "transitive-dependency"
  | "dependency-depth"
  | "substitute"
  | "license";

export type InventoryAuditCategory =
  | "eol"
  | "unsupported"
  | "hazardous"
  | "missing"
  | "quantity"
  | "substitute";

export type AuditCategory = RecipeAlertCategory | InventoryAuditCategory;

type BaseAuditIssue = {
  id: string;
  severity: AuditSeverity;
  componentName?: string;
  message: string;
  recommendation?: string;
};

export type RecipeAlert = BaseAuditIssue & {
  category: RecipeAlertCategory;
};

export type InventoryAuditIssue = BaseAuditIssue & {
  category: InventoryAuditCategory;
  inventoryItemId?: string;
};

export type AuditIssue = RecipeAlert | InventoryAuditIssue;

export type AuditSummary = {
  totalIssues: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
};

export type InventoryAuditResult = {
  recipeId: string;
  generatedAt: string;
  summary: AuditSummary;
  issues: InventoryAuditIssue[];
};

export type NomAuditResult = {
  recipeId: string;
  generatedAt: string;
  recipeAlerts: RecipeAlert[];
  inventoryAudit: InventoryAuditResult;
};

export type AuditResult = {
  recipeId: string;
  generatedAt: string;
  summary: AuditSummary;
  issues: AuditIssue[];
};

export type RecipeAlertInput = {
  recipe: RecipeRepositoryEntity;
  components: RecipeComponent[];
};

export type InventoryAuditInput = {
  recipe: RecipeRepositoryEntity;
  components: RecipeComponent[];
  inventoryItems: InventoryItem[];
  now: Date;
  settings: AppSettings;
};

export type NomAuditInput = InventoryAuditInput;
