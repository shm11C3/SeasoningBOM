import type { IngredientCategory, InventoryItem, Unit } from "../../domain";
import type { D1Database } from "../../workers/api/types";

export type CloudInventoryItem = InventoryItem & {
  userId: string;
};

export type CreateInventoryItemInput = {
  id: string;
  userId: string;
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: Unit;
  bestBeforeDate?: string;
  useByDate?: string;
  hazardous?: boolean;
  now: string;
};

export type UpdateInventoryItemInput = {
  id: string;
  userId: string;
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: Unit;
  bestBeforeDate?: string;
  useByDate?: string;
  hazardous: boolean;
  createdAt: string;
  now: string;
};

type InventoryItemRow = {
  id: string;
  user_id: string;
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: Unit;
  best_before_date: string | null;
  use_by_date: string | null;
  hazardous: number;
  created_at: string;
  updated_at: string;
};

export type InventoryItemRepository = {
  create(input: CreateInventoryItemInput): Promise<CloudInventoryItem>;
  deleteForUser(userId: string, id: string): Promise<void>;
  findByIdForUser(userId: string, id: string): Promise<CloudInventoryItem | null>;
  listByUserId(userId: string): Promise<CloudInventoryItem[]>;
  update(input: UpdateInventoryItemInput): Promise<CloudInventoryItem>;
};

const inventorySelect = `SELECT
  id,
  user_id,
  name,
  category,
  quantity,
  unit,
  best_before_date,
  use_by_date,
  hazardous,
  created_at,
  updated_at
FROM inventory_items`;

export class D1InventoryRepository implements InventoryItemRepository {
  constructor(private readonly db: D1Database) {}

  async listByUserId(userId: string): Promise<CloudInventoryItem[]> {
    const result = await this.db
      .prepare(`${inventorySelect}
         WHERE user_id = ?
         ORDER BY name COLLATE NOCASE ASC, updated_at DESC`)
      .bind(userId)
      .all<InventoryItemRow>();

    return (result.results ?? []).map(mapInventoryItemRow);
  }

  async findByIdForUser(userId: string, id: string): Promise<CloudInventoryItem | null> {
    const row = await this.db
      .prepare(`${inventorySelect}
         WHERE user_id = ? AND id = ?`)
      .bind(userId, id)
      .first<InventoryItemRow>();

    return row ? mapInventoryItemRow(row) : null;
  }

  async create(input: CreateInventoryItemInput): Promise<CloudInventoryItem> {
    const hazardous = input.hazardous ?? false;

    await this.db
      .prepare(
        `INSERT INTO inventory_items (
           id, user_id, name, category, quantity, unit, best_before_date,
           use_by_date, hazardous, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.userId,
        input.name,
        input.category,
        input.quantity,
        input.unit,
        input.bestBeforeDate ?? null,
        input.useByDate ?? null,
        hazardous,
        input.now,
        input.now,
      )
      .run();

    return {
      id: input.id,
      userId: input.userId,
      name: input.name,
      category: input.category,
      quantity: input.quantity,
      unit: input.unit,
      bestBeforeDate: input.bestBeforeDate,
      useByDate: input.useByDate,
      hazardous,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  async update(input: UpdateInventoryItemInput): Promise<CloudInventoryItem> {
    await this.db
      .prepare(
        `UPDATE inventory_items
         SET name = ?,
             category = ?,
             quantity = ?,
             unit = ?,
             best_before_date = ?,
             use_by_date = ?,
             hazardous = ?,
             updated_at = ?
         WHERE user_id = ? AND id = ?`,
      )
      .bind(
        input.name,
        input.category,
        input.quantity,
        input.unit,
        input.bestBeforeDate ?? null,
        input.useByDate ?? null,
        input.hazardous,
        input.now,
        input.userId,
        input.id,
      )
      .run();

    return {
      id: input.id,
      userId: input.userId,
      name: input.name,
      category: input.category,
      quantity: input.quantity,
      unit: input.unit,
      bestBeforeDate: input.bestBeforeDate,
      useByDate: input.useByDate,
      hazardous: input.hazardous,
      createdAt: input.createdAt,
      updatedAt: input.now,
    };
  }

  async deleteForUser(userId: string, id: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM inventory_items WHERE user_id = ? AND id = ?")
      .bind(userId, id)
      .run();
  }
}

export function mapInventoryItemRow(row: InventoryItemRow): CloudInventoryItem {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    unit: row.unit,
    bestBeforeDate: row.best_before_date ?? undefined,
    useByDate: row.use_by_date ?? undefined,
    hazardous: row.hazardous !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
