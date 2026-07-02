import type { AuditIssue, AuditSummary } from "../audit/types";
import type { LifecycleStatus } from "../lifecycle/types";
import type { Allergen, DependencyType, IngredientDependencyType, Unit } from "../recipe/types";

export type SeasoningBOM = {
  bomFormat: "SeasoningBOM";
  specVersion: "0.1.0";
  generatedAt: string;
  recipe: SeasoningBOMRecipe;
  components: SeasoningBOMComponent[];
  audit: SeasoningBOMAudit;
};

export type SeasoningBOMRecipe = {
  name: string;
  version: string;
  servings: number;
};

export type SeasoningBOMComponent = {
  name: string;
  quantity: number;
  unit: Unit;
  dependencyType: DependencyType;
  required: boolean;
  lifecycle?: {
    eolDate?: string;
    useByDate?: string;
    status: LifecycleStatus;
  };
  allergens: Allergen[];
  dependencies: SeasoningBOMDependency[];
};

export type SeasoningBOMDependency = {
  name: string;
  dependencyType: IngredientDependencyType;
  allergens: Allergen[];
  notes?: string;
};

export type SeasoningBOMAudit = {
  summary: AuditSummary;
  issues: AuditIssue[];
};
