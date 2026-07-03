import type {
  AppSettings,
  InventoryItem,
  RecipeComponent,
  RecipeRepositoryEntity,
} from "../../domain";
import { defaultSettings } from "../../domain";
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

export class MemoryRecipeRepository implements RecipeRepository {
  constructor(private readonly recipes = new Map<string, RecipeRepositoryEntity>()) {}

  async findAll(): Promise<RecipeRepositoryEntity[]> {
    return [...this.recipes.values()].toSorted((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async findById(id: string): Promise<RecipeRepositoryEntity | null> {
    return this.recipes.get(id) ?? null;
  }

  async findByOwnerAndSlug(
    ownerHandle: string,
    slug: string,
  ): Promise<RecipeRepositoryEntity | null> {
    return (
      [...this.recipes.values()].find(
        (recipe) => recipe.ownerHandle === ownerHandle && recipe.slug === slug,
      ) ?? null
    );
  }

  async findBySlug(slug: string): Promise<RecipeRepositoryEntity | null> {
    return [...this.recipes.values()].find((recipe) => recipe.slug === slug) ?? null;
  }

  async save(recipe: RecipeRepositoryEntity): Promise<void> {
    this.recipes.set(recipe.id, recipe);
  }

  async delete(id: string): Promise<void> {
    this.recipes.delete(id);
  }
}

export class MemoryRecipeComponentRepository implements RecipeComponentRepository {
  constructor(private readonly components = new Map<string, RecipeComponent>()) {}

  async findAll(): Promise<RecipeComponent[]> {
    return [...this.components.values()].toSorted((left, right) =>
      left.ingredientName.localeCompare(right.ingredientName),
    );
  }

  async findByRecipeId(recipeId: string): Promise<RecipeComponent[]> {
    return [...this.components.values()].filter((component) => component.recipeId === recipeId);
  }

  async saveMany(recipeId: string, components: RecipeComponent[]): Promise<void> {
    for (const component of [...this.components.values()]) {
      if (component.recipeId === recipeId) {
        this.components.delete(component.id);
      }
    }
    for (const component of components) {
      this.components.set(component.id, component);
    }
  }

  async deleteByRecipeId(recipeId: string): Promise<void> {
    for (const component of [...this.components.values()]) {
      if (component.recipeId === recipeId) {
        this.components.delete(component.id);
      }
    }
  }
}

export class MemoryInventoryRepository implements InventoryRepository {
  constructor(private readonly inventoryItems = new Map<string, InventoryItem>()) {}

  async findAll(): Promise<InventoryItem[]> {
    return [...this.inventoryItems.values()].toSorted((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async findById(id: string): Promise<InventoryItem | null> {
    return this.inventoryItems.get(id) ?? null;
  }

  async findByName(name: string): Promise<InventoryItem[]> {
    return [...this.inventoryItems.values()].filter(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    );
  }

  async save(item: InventoryItem): Promise<void> {
    this.inventoryItems.set(item.id, item);
  }

  async delete(id: string): Promise<void> {
    this.inventoryItems.delete(id);
  }
}

export class MemorySettingsRepository implements SettingsRepository {
  private settings = defaultSettings;

  async get(): Promise<AppSettings> {
    return this.settings;
  }

  async save(settings: AppSettings): Promise<void> {
    this.settings = settings;
  }
}

export class MemoryBackupRepository implements BackupRepository {
  constructor(private readonly repositories: RepositorySet) {}

  async exportAll(): Promise<SeasoningBOMAppBackup> {
    return {
      format: "SeasoningBOMAppBackup",
      version: "0.1.0",
      exportedAt: "2026-07-01T00:00:00.000Z",
      repositories: await this.repositories.recipes.findAll(),
      components: await this.repositories.components.findAll(),
      inventoryItems: await this.repositories.inventory.findAll(),
      settings: await this.repositories.settings.get(),
    };
  }

  async importAll(backup: SeasoningBOMAppBackup, _options: ImportOptions): Promise<ImportResult> {
    const repositories = backup.repositories.map(normalizeRecipeRepository);
    for (const recipe of repositories) {
      await this.repositories.recipes.save(recipe);
    }
    for (const item of backup.inventoryItems) {
      await this.repositories.inventory.save(item);
    }
    const recipeIds = new Set(repositories.map((recipe) => recipe.id));
    for (const recipeId of recipeIds) {
      await this.repositories.components.saveMany(
        recipeId,
        backup.components.filter((component) => component.recipeId === recipeId),
      );
    }
    await this.repositories.settings.save(backup.settings);
    return {
      importedRepositories: repositories.length,
      importedComponents: backup.components.length,
      importedInventoryItems: backup.inventoryItems.length,
      warnings: [],
    };
  }
}

function normalizeRecipeRepository(recipe: RecipeRepositoryEntity): RecipeRepositoryEntity {
  return {
    ...recipe,
    ownerHandle: recipe.ownerHandle ?? "me",
    visibility: recipe.visibility ?? "public",
  };
}

export function createMemoryRepositories(): RepositorySet {
  const recipes = new MemoryRecipeRepository();
  const components = new MemoryRecipeComponentRepository();
  const inventory = new MemoryInventoryRepository();
  const settings = new MemorySettingsRepository();
  const repositories = {
    recipes,
    components,
    inventory,
    settings,
    backup: undefined as unknown as BackupRepository,
  };
  repositories.backup = new MemoryBackupRepository(repositories);
  return repositories;
}
