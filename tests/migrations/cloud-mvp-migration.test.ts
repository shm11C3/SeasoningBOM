import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { cloudMvpRequiredIndexNames, cloudMvpTableNames } from "../../src/workers/api/schema";

const migrationSql = readFileSync(join(process.cwd(), "migrations/0001_cloud_mvp.sql"), "utf8");

describe("Cloud MVP D1 migration smoke test", () => {
  it("applies to a SQLite-compatible database", () => {
    const db = new DatabaseSync(":memory:");

    try {
      db.exec(migrationSql);

      const tableRows = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as Array<{ name: string }>;
      const indexRows = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'",
        )
        .all() as Array<{ name: string }>;
      const recipeRepositoryForeignKeys = db
        .prepare("PRAGMA foreign_key_list(recipe_repositories)")
        .all() as Array<{ table: string }>;
      const inventoryForeignKeys = db
        .prepare("PRAGMA foreign_key_list(inventory_items)")
        .all() as Array<{ table: string }>;
      const cookingLogInventoryForeignKeys = db
        .prepare("PRAGMA foreign_key_list(cooking_log_inventory_items)")
        .all() as Array<{ table: string }>;

      expect(tableRows.map((row) => row.name)).toEqual(
        expect.arrayContaining([...cloudMvpTableNames]),
      );
      expect(indexRows.map((row) => row.name)).toEqual(
        expect.arrayContaining([...cloudMvpRequiredIndexNames]),
      );
      expect(recipeRepositoryForeignKeys.map((row) => row.table)).toEqual(
        expect.arrayContaining(["user_profiles", "recipe_repositories"]),
      );
      expect(inventoryForeignKeys.map((row) => row.table)).toEqual(["user_profiles"]);
      expect(cookingLogInventoryForeignKeys.map((row) => row.table)).toEqual(
        expect.arrayContaining(["cooking_logs", "inventory_items"]),
      );
    } finally {
      db.close();
    }
  });
});
