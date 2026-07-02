import type { Unit } from "../recipe/types";

export type IngredientCategory =
  | "produce"
  | "meat"
  | "seafood"
  | "dairy"
  | "grain"
  | "seasoning"
  | "prepared"
  | "pantry"
  | "tool"
  | "other";

export type InventoryItem = {
  id: string;
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: Unit;
  bestBeforeDate?: string;
  useByDate?: string;
  hazardous: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  id: "default";
  deprecatedThresholdDays: number;
  preferredTheme: "light" | "dark" | "system";
  defaultMaintainer?: string;
  updatedAt: string;
};

export const ingredientCategories: IngredientCategory[] = [
  "produce",
  "meat",
  "seafood",
  "dairy",
  "grain",
  "seasoning",
  "prepared",
  "pantry",
  "tool",
  "other",
];

export const defaultSettings: AppSettings = {
  id: "default",
  deprecatedThresholdDays: 3,
  preferredTheme: "system",
  updatedAt: "2026-07-01T00:00:00.000Z",
};
