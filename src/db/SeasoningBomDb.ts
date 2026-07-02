import Dexie, { type Table } from "dexie";
import type {
  AppSettings,
  InventoryItem,
  RecipeComponent,
  RecipeRepositoryEntity,
} from "../domain";

export class SeasoningBomDb extends Dexie {
  recipeRepositories!: Table<RecipeRepositoryEntity, string>;
  recipeComponents!: Table<RecipeComponent, string>;
  inventoryItems!: Table<InventoryItem, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super("SeasoningBOM");

    this.version(1).stores({
      recipeRepositories: "id, slug, name, updatedAt",
      recipeComponents: "id, recipeId, ingredientName",
      inventoryItems: "id, name, category, bestBeforeDate, useByDate",
      settings: "id",
    });
  }
}

export const seasoningBomDb = new SeasoningBomDb();
