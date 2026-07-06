import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D1InventoryRepository } from "../../../src/repositories/cloudflare-d1/D1InventoryRepository";
import { D1UserProfileRepository } from "../../../src/repositories/cloudflare-d1/D1UserProfileRepository";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1Value,
} from "../../../src/workers/api/types";

type SqliteValue = bigint | null | number | string;

const migrationSql = readFileSync(join(process.cwd(), "migrations/0001_cloud_mvp.sql"), "utf8");

describe("D1InventoryRepository", () => {
  let inventory: D1InventoryRepository;
  let sqlite: DatabaseSync;
  let users: D1UserProfileRepository;

  beforeEach(async () => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(migrationSql);
    const db = createSqliteD1(sqlite);
    inventory = new D1InventoryRepository(db);
    users = new D1UserProfileRepository(db);

    await users.create({
      authProvider: "clerk",
      authSubject: "user_test",
      id: "profile_test",
      now: "2026-07-06T00:00:00.000Z",
      username: "test-user",
    });
    await users.create({
      authProvider: "clerk",
      authSubject: "user_other",
      id: "profile_other",
      now: "2026-07-06T00:00:00.000Z",
      username: "other-user",
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("creates and lists inventory items scoped to the owner", async () => {
    const created = await inventory.create({
      bestBeforeDate: "2026-07-10",
      category: "grain",
      hazardous: false,
      id: "inventory_rice",
      name: "Rice",
      now: "2026-07-06T01:02:03.000Z",
      quantity: 2,
      unit: "go",
      useByDate: "2026-07-12",
      userId: "profile_test",
    });
    await inventory.create({
      category: "seasoning",
      id: "inventory_salt",
      name: "Salt",
      now: "2026-07-06T01:02:03.000Z",
      quantity: 1,
      unit: "pinch",
      userId: "profile_other",
    });

    await expect(inventory.listByUserId("profile_test")).resolves.toEqual([created]);
    await expect(inventory.findByIdForUser("profile_test", "inventory_rice")).resolves.toEqual(
      created,
    );
    await expect(inventory.findByIdForUser("profile_other", "inventory_rice")).resolves.toBeNull();
  });

  it("updates and deletes inventory items for the owner only", async () => {
    const created = await inventory.create({
      category: "dairy",
      hazardous: false,
      id: "inventory_milk",
      name: "Milk",
      now: "2026-07-06T01:02:03.000Z",
      quantity: 1,
      unit: "pack",
      userId: "profile_test",
    });

    const updated = await inventory.update({
      ...created,
      bestBeforeDate: "2026-07-08",
      hazardous: true,
      now: "2026-07-06T02:03:04.000Z",
      quantity: 2,
    });
    expect(updated).not.toBeNull();
    if (!updated) {
      throw new Error("Expected inventory update to return the updated item.");
    }

    await expect(inventory.findByIdForUser("profile_test", "inventory_milk")).resolves.toEqual(
      updated,
    );
    expect(updated).toMatchObject({
      bestBeforeDate: "2026-07-08",
      hazardous: true,
      quantity: 2,
      updatedAt: "2026-07-06T02:03:04.000Z",
    });

    await expect(
      inventory.update({
        ...updated,
        now: "2026-07-06T03:04:05.000Z",
        quantity: 9,
        userId: "profile_other",
      }),
    ).resolves.toBeNull();
    await expect(inventory.findByIdForUser("profile_test", "inventory_milk")).resolves.toEqual(
      updated,
    );

    await inventory.deleteForUser("profile_other", "inventory_milk");
    await expect(inventory.findByIdForUser("profile_test", "inventory_milk")).resolves.toEqual(
      updated,
    );

    await inventory.deleteForUser("profile_test", "inventory_milk");
    await expect(inventory.findByIdForUser("profile_test", "inventory_milk")).resolves.toBeNull();
  });
});

function createSqliteD1(db: DatabaseSync): D1Database {
  return {
    batch: async () => {
      throw new Error("batch is not implemented in this test adapter");
    },
    exec: async (query) => {
      db.exec(query);
      return { success: true };
    },
    prepare: (query) => createStatement(db, query),
  };
}

function createStatement(
  db: DatabaseSync,
  query: string,
  values: D1Value[] = [],
): D1PreparedStatement {
  const sqliteValues = values.map(toSqliteValue);

  return {
    all: async <T = unknown>() => {
      const results = db.prepare(query).all(...sqliteValues) as T[];
      return { results, success: true } satisfies D1Result<T>;
    },
    bind: (...nextValues) => createStatement(db, query, nextValues),
    first: async <T = unknown>() =>
      (db.prepare(query).get(...sqliteValues) as T | undefined) ?? null,
    raw: async <_T = unknown>() => {
      throw new Error("raw is not implemented in this test adapter");
    },
    run: async <T = unknown>() => {
      const result = db.prepare(query).run(...sqliteValues) as { changes?: bigint | number };
      return {
        meta: { changes: Number(result.changes ?? 0) },
        success: true,
      } satisfies D1Result<T>;
    },
  };
}

function toSqliteValue(value: D1Value): SqliteValue {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (value instanceof ArrayBuffer) {
    throw new Error("ArrayBuffer values are not implemented in this test adapter");
  }

  return value;
}
