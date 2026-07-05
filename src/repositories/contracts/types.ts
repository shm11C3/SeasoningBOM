import type {
  AppSettings,
  InventoryItem,
  RecipeComponent,
  RecipeRepositoryEntity,
} from "../../domain";

export type RecipeRepository = {
  findAll(): Promise<RecipeRepositoryEntity[]>;
  findById(id: string): Promise<RecipeRepositoryEntity | null>;
  findByOwnerAndSlug(ownerHandle: string, slug: string): Promise<RecipeRepositoryEntity | null>;
  findBySlug(slug: string): Promise<RecipeRepositoryEntity | null>;
  save(recipe: RecipeRepositoryEntity): Promise<void>;
  delete(id: string): Promise<void>;
};

export type RecipeComponentRepository = {
  findAll(): Promise<RecipeComponent[]>;
  findByRecipeId(recipeId: string): Promise<RecipeComponent[]>;
  saveMany(recipeId: string, components: RecipeComponent[]): Promise<void>;
  deleteByRecipeId(recipeId: string): Promise<void>;
};

export type InventoryRepository = {
  findAll(): Promise<InventoryItem[]>;
  findById(id: string): Promise<InventoryItem | null>;
  findByName(name: string): Promise<InventoryItem[]>;
  save(item: InventoryItem): Promise<void>;
  delete(id: string): Promise<void>;
};

export type SettingsRepository = {
  get(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
};

export type SeasoningBOMAppBackup = {
  format: "SeasoningBOMAppBackup";
  version: "0.1.0";
  exportedAt: string;
  repositories: RecipeRepositoryEntity[];
  components: RecipeComponent[];
  inventoryItems: InventoryItem[];
  settings: AppSettings;
};

export type ImportOptions = {
  conflictStrategy: "overwrite" | "duplicate";
};

export type ImportResult = {
  importedRepositories: number;
  importedComponents: number;
  importedInventoryItems: number;
  warnings: string[];
};

export type BackupRepository = {
  exportAll(): Promise<SeasoningBOMAppBackup>;
  importAll(backup: SeasoningBOMAppBackup, options: ImportOptions): Promise<ImportResult>;
};

export type RepositorySet = {
  recipes: RecipeRepository;
  components: RecipeComponentRepository;
  inventory: InventoryRepository;
  settings: SettingsRepository;
  backup: BackupRepository;
};
