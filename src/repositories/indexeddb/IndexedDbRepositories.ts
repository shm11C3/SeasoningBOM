import type { SeasoningBomDb } from "../../db/SeasoningBomDb";
import { type AppSettings, defaultSettings, type InventoryItem } from "../../domain";
import type { RecipeComponent, RecipeRepositoryEntity } from "../../domain/recipe/types";
import type {
  BackupRepository,
  ImportOptions,
  ImportResult,
  InventoryRepository,
  RecipeComponentRepository,
  RecipeRepository,
  RepositorySet,
  SeasoningBOMAppBackup,
  SettingsRepository,
} from "../contracts";

export class IndexedDbRecipeRepository implements RecipeRepository {
  constructor(private readonly db: SeasoningBomDb) {}

  async findAll(): Promise<RecipeRepositoryEntity[]> {
    return this.db.recipeRepositories.orderBy("name").toArray();
  }

  async findById(id: string): Promise<RecipeRepositoryEntity | null> {
    return (await this.db.recipeRepositories.get(id)) ?? null;
  }

  async findBySlug(slug: string): Promise<RecipeRepositoryEntity | null> {
    return (await this.db.recipeRepositories.where("slug").equals(slug).first()) ?? null;
  }

  async save(recipe: RecipeRepositoryEntity): Promise<void> {
    await this.db.recipeRepositories.put(recipe);
  }

  async delete(id: string): Promise<void> {
    await this.db.transaction(
      "rw",
      this.db.recipeRepositories,
      this.db.recipeComponents,
      async () => {
        await this.db.recipeComponents.where("recipeId").equals(id).delete();
        await this.db.recipeRepositories.delete(id);
      },
    );
  }
}

export class IndexedDbRecipeComponentRepository implements RecipeComponentRepository {
  constructor(private readonly db: SeasoningBomDb) {}

  async findAll(): Promise<RecipeComponent[]> {
    return this.db.recipeComponents.orderBy("ingredientName").toArray();
  }

  async findByRecipeId(recipeId: string): Promise<RecipeComponent[]> {
    return this.db.recipeComponents.where("recipeId").equals(recipeId).toArray();
  }

  async saveMany(recipeId: string, components: RecipeComponent[]): Promise<void> {
    await this.db.transaction("rw", this.db.recipeComponents, async () => {
      await this.db.recipeComponents.where("recipeId").equals(recipeId).delete();
      await this.db.recipeComponents.bulkPut(components);
    });
  }

  async deleteByRecipeId(recipeId: string): Promise<void> {
    await this.db.recipeComponents.where("recipeId").equals(recipeId).delete();
  }
}

export class IndexedDbInventoryRepository implements InventoryRepository {
  constructor(private readonly db: SeasoningBomDb) {}

  async findAll(): Promise<InventoryItem[]> {
    return this.db.inventoryItems.orderBy("name").toArray();
  }

  async findById(id: string): Promise<InventoryItem | null> {
    return (await this.db.inventoryItems.get(id)) ?? null;
  }

  async findByName(name: string): Promise<InventoryItem[]> {
    return this.db.inventoryItems.where("name").equalsIgnoreCase(name).toArray();
  }

  async save(item: InventoryItem): Promise<void> {
    await this.db.inventoryItems.put(item);
  }

  async delete(id: string): Promise<void> {
    await this.db.inventoryItems.delete(id);
  }
}

export class IndexedDbSettingsRepository implements SettingsRepository {
  constructor(private readonly db: SeasoningBomDb) {}

  async get(): Promise<AppSettings> {
    const stored = await this.db.settings.get("default");
    if (stored) {
      return stored;
    }

    return { ...defaultSettings, updatedAt: new Date().toISOString() };
  }

  async save(settings: AppSettings): Promise<void> {
    await this.db.settings.put(settings);
  }
}

export class IndexedDbBackupRepository implements BackupRepository {
  constructor(private readonly db: SeasoningBomDb) {}

  async exportAll(): Promise<SeasoningBOMAppBackup> {
    const settings = (await this.db.settings.get("default")) ?? {
      ...defaultSettings,
      updatedAt: new Date().toISOString(),
    };

    return {
      format: "SeasoningBOMAppBackup",
      version: "0.1.0",
      exportedAt: new Date().toISOString(),
      repositories: await this.db.recipeRepositories.toArray(),
      components: await this.db.recipeComponents.toArray(),
      inventoryItems: await this.db.inventoryItems.toArray(),
      settings,
    };
  }

  async importAll(backup: SeasoningBOMAppBackup, options: ImportOptions): Promise<ImportResult> {
    validateBackup(backup);

    if (options.conflictStrategy === "overwrite") {
      await this.db.transaction(
        "rw",
        this.db.recipeRepositories,
        this.db.recipeComponents,
        this.db.inventoryItems,
        this.db.settings,
        async () => {
          await this.db.recipeRepositories.bulkPut(backup.repositories);
          await this.db.recipeComponents.bulkPut(backup.components);
          await this.db.inventoryItems.bulkPut(backup.inventoryItems);
          await this.db.settings.put(backup.settings);
        },
      );
      return importedCounts(backup, []);
    }

    const recipeIdMap = new Map<string, string>();
    const duplicatedRepositories = backup.repositories.map((recipe) => {
      const id = createId("recipe");
      recipeIdMap.set(recipe.id, id);
      return {
        ...recipe,
        id,
        slug: `${recipe.slug}-${id.slice(-6)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
    const duplicatedComponents = backup.components.map((component) => ({
      ...component,
      id: createId("component"),
      recipeId: recipeIdMap.get(component.recipeId) ?? component.recipeId,
    }));
    const duplicatedInventoryItems = backup.inventoryItems.map((item) => {
      const id = createId("inventory");
      return {
        ...item,
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    await this.db.transaction(
      "rw",
      this.db.recipeRepositories,
      this.db.recipeComponents,
      this.db.inventoryItems,
      this.db.settings,
      async () => {
        await this.db.recipeRepositories.bulkPut(duplicatedRepositories);
        await this.db.recipeComponents.bulkPut(duplicatedComponents);
        await this.db.inventoryItems.bulkPut(duplicatedInventoryItems);
        await this.db.settings.put({ ...backup.settings, updatedAt: new Date().toISOString() });
      },
    );

    return importedCounts(
      {
        ...backup,
        repositories: duplicatedRepositories,
        components: duplicatedComponents,
        inventoryItems: duplicatedInventoryItems,
      },
      ["Imported as duplicates with new IDs."],
    );
  }
}

export function createIndexedDbRepositories(db: SeasoningBomDb): RepositorySet {
  return {
    recipes: new IndexedDbRecipeRepository(db),
    components: new IndexedDbRecipeComponentRepository(db),
    inventory: new IndexedDbInventoryRepository(db),
    settings: new IndexedDbSettingsRepository(db),
    backup: new IndexedDbBackupRepository(db),
  };
}

function validateBackup(value: SeasoningBOMAppBackup): void {
  if (value.format !== "SeasoningBOMAppBackup" || value.version !== "0.1.0") {
    throw new Error("Unsupported backup format. Expected SeasoningBOMAppBackup v0.1.0.");
  }
  if (!Array.isArray(value.repositories) || !Array.isArray(value.components)) {
    throw new Error("Backup is missing repositories or components.");
  }
  if (!Array.isArray(value.inventoryItems) || !value.settings) {
    throw new Error("Backup is missing inventory items or settings.");
  }
}

function importedCounts(backup: SeasoningBOMAppBackup, warnings: string[]): ImportResult {
  return {
    importedRepositories: backup.repositories.length,
    importedComponents: backup.components.length,
    importedInventoryItems: backup.inventoryItems.length,
    warnings,
  };
}

function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}
