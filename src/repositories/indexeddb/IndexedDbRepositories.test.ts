import { describe, expect, it } from "vitest";
import type { SeasoningBomDb } from "../../db/SeasoningBomDb";
import { defaultSettings } from "../../domain";
import {
  makeComponent,
  makeInventoryItem,
  makeRecipe,
  makeSettings,
} from "../../test/factories/domainFactories";
import { createIndexedDbRepositories } from "./IndexedDbRepositories";

class FakeQuery<T extends { id: string }> {
  constructor(
    private readonly table: FakeTable<T>,
    private readonly predicate: (item: T) => boolean,
  ) {}

  equals(value: unknown) {
    return new FakeQuery(this.table, this.predicateFor(value));
  }

  equalsIgnoreCase(value: string) {
    return new FakeQuery(
      this.table,
      (item) => String(this.table.valueFor(item)).toLowerCase() === value.toLowerCase(),
    );
  }

  async first(): Promise<T | undefined> {
    return (await this.toArray())[0];
  }

  async toArray(): Promise<T[]> {
    return this.table.values().filter(this.predicate);
  }

  async delete(): Promise<void> {
    for (const item of await this.toArray()) {
      this.table.rows.delete(item.id);
    }
  }

  private predicateFor(value: unknown) {
    return (item: T) => {
      const itemValue = this.table.valueFor(item);
      return Array.isArray(itemValue) && Array.isArray(value)
        ? itemValue.length === value.length &&
            itemValue.every((part, index) => part === value[index])
        : itemValue === value;
    };
  }
}

class FakeTable<T extends { id: string }> {
  readonly rows = new Map<string, T>();
  private activeKey = "id";

  orderBy(key: string) {
    return {
      toArray: async () =>
        this.values().toSorted((left, right) =>
          String(left[key as keyof T]).localeCompare(String(right[key as keyof T])),
        ),
    };
  }

  where(key: string) {
    this.activeKey = key;
    return new FakeQuery<T>(this, () => true);
  }

  async toArray(): Promise<T[]> {
    return this.values();
  }

  async get(id: string): Promise<T | undefined> {
    return this.rows.get(id);
  }

  async put(item: T): Promise<void> {
    this.rows.set(item.id, item);
  }

  async bulkPut(items: T[]): Promise<void> {
    for (const item of items) {
      await this.put(item);
    }
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  valueFor(item: T): unknown {
    if (this.activeKey === "[ownerHandle+slug]") {
      const repository = item as T & { ownerHandle?: string; slug?: string };
      return [repository.ownerHandle, repository.slug];
    }
    return item[this.activeKey as keyof T];
  }

  values(): T[] {
    return [...this.rows.values()];
  }
}

class FakeDb {
  recipeRepositories = new FakeTable<ReturnType<typeof makeRecipe>>();
  recipeComponents = new FakeTable<ReturnType<typeof makeComponent>>();
  inventoryItems = new FakeTable<ReturnType<typeof makeInventoryItem>>();
  settings = new FakeTable<ReturnType<typeof makeSettings>>();

  async transaction(_mode: string, ...tablesAndCallback: unknown[]): Promise<void> {
    const callback = tablesAndCallback.at(-1);
    if (typeof callback === "function") {
      await callback();
    }
  }
}

function createFakeRepositories() {
  const db = new FakeDb();
  return { db, repositories: createIndexedDbRepositories(db as unknown as SeasoningBomDb) };
}

describe("IndexedDB repositories", () => {
  it("stores, queries, sorts, and deletes recipes and components", async () => {
    const { db, repositories } = createFakeRepositories();
    const curry = makeRecipe({ id: "recipe-curry", name: "Curry Rice", slug: "curry-rice" });
    const salad = makeRecipe({ id: "recipe-salad", name: "Apple Salad", slug: "apple-salad" });
    const component = makeComponent({ id: "component-rice", recipeId: curry.id });

    await repositories.recipes.save(curry);
    await repositories.recipes.save(salad);
    await repositories.components.saveMany(curry.id, [component]);

    await expect(repositories.recipes.findAll()).resolves.toMatchObject([
      { name: "Apple Salad" },
      { name: "Curry Rice" },
    ]);
    await expect(repositories.recipes.findById(curry.id)).resolves.toMatchObject(curry);
    await expect(repositories.recipes.findBySlug("curry-rice")).resolves.toMatchObject(curry);
    await expect(
      repositories.recipes.findByOwnerAndSlug("me", "curry-rice"),
    ).resolves.toMatchObject(curry);
    await expect(
      repositories.recipes.findByOwnerAndSlug("other", "curry-rice"),
    ).resolves.toBeNull();
    await expect(repositories.components.findAll()).resolves.toHaveLength(1);
    await expect(repositories.components.findByRecipeId(curry.id)).resolves.toEqual([component]);

    await repositories.recipes.delete(curry.id);
    await expect(repositories.recipes.findById(curry.id)).resolves.toBeNull();
    expect(db.recipeComponents.values()).toHaveLength(0);
  });

  it("stores inventory and settings", async () => {
    const { repositories } = createFakeRepositories();
    const item = makeInventoryItem({ id: "inventory-rice", name: "Rice" });

    await repositories.inventory.save(item);
    await expect(repositories.inventory.findAll()).resolves.toEqual([item]);
    await expect(repositories.inventory.findById(item.id)).resolves.toEqual(item);
    await expect(repositories.inventory.findByName("rice")).resolves.toEqual([item]);

    await repositories.inventory.delete(item.id);
    await expect(repositories.inventory.findById(item.id)).resolves.toBeNull();

    await expect(repositories.settings.get()).resolves.toMatchObject({
      id: "default",
      preferredTheme: defaultSettings.preferredTheme,
    });
    await repositories.settings.save(makeSettings({ preferredTheme: "dark" }));
    await expect(repositories.settings.get()).resolves.toMatchObject({ preferredTheme: "dark" });
  });

  it("exports, overwrites, duplicates, and validates backups", async () => {
    const { repositories } = createFakeRepositories();
    const recipe = makeRecipe();
    const component = makeComponent();
    const inventoryItem = makeInventoryItem();
    const settings = makeSettings({ preferredTheme: "light" });

    await repositories.recipes.save(recipe);
    await repositories.components.saveMany(recipe.id, [component]);
    await repositories.inventory.save(inventoryItem);
    await repositories.settings.save(settings);

    const backup = await repositories.backup.exportAll();
    expect(backup).toMatchObject({
      components: [component],
      format: "SeasoningBOMAppBackup",
      inventoryItems: [inventoryItem],
      repositories: [recipe],
      settings,
      version: "0.1.0",
    });

    const overwrite = await repositories.backup.importAll(backup, {
      conflictStrategy: "overwrite",
    });
    expect(overwrite).toMatchObject({
      importedComponents: 1,
      importedInventoryItems: 1,
      importedRepositories: 1,
      warnings: [],
    });

    const duplicate = await repositories.backup.importAll(backup, {
      conflictStrategy: "duplicate",
    });
    expect(duplicate.warnings).toEqual(["Imported as duplicates with new IDs."]);
    await expect(repositories.recipes.findAll()).resolves.toHaveLength(2);

    await expect(
      repositories.backup.importAll(
        { ...backup, version: "9.9.9" as "0.1.0" },
        {
          conflictStrategy: "overwrite",
        },
      ),
    ).rejects.toThrow("Unsupported backup format");
    await expect(
      repositories.backup.importAll(
        { ...backup, components: null as never },
        {
          conflictStrategy: "overwrite",
        },
      ),
    ).rejects.toThrow("Backup is missing repositories or components");
    await expect(
      repositories.backup.importAll(
        { ...backup, inventoryItems: null as never },
        {
          conflictStrategy: "overwrite",
        },
      ),
    ).rejects.toThrow("Backup is missing inventory items or settings");
  });
});
