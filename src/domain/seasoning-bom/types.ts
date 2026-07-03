import type { RecipeAlert } from "../audit/types";
import type { Allergen, DependencyType, IngredientDependencyType, Unit } from "../recipe/types";

export type SeasoningBOM = {
  bomFormat: "SeasoningBOM";
  specVersion: "0.1.0";
  generatedAt: string;
  repository: SeasoningBOMRepository;
  components: SeasoningBOMComponent[];
  audit: SeasoningBOMAudit;
};

export type SeasoningBOMRepository = {
  owner: string;
  name: string;
  version: string;
  visibility: "public" | "private" | "unlisted";
};

export type SeasoningBOMComponent = {
  name: string;
  quantity: number;
  unit: Unit;
  dependencyType: DependencyType;
  required: boolean;
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
  issues: RecipeAlert[];
};
