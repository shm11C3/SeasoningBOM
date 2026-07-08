import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D1InventoryRepository } from "../../../src/repositories/cloudflare-d1/D1InventoryRepository";
import { D1UserProfileRepository } from "../../../src/repositories/cloudflare-d1/D1UserProfileRepository";
import { createSqliteD1 } from "./sqliteD1";

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

  it("lists only requested inventory IDs for the owner", async () => {
    const rice = await inventory.create({
      category: "grain",
      id: "inventory_rice",
      name: "Rice",
      now: "2026-07-06T01:02:03.000Z",
      quantity: 2,
      unit: "go",
      userId: "profile_test",
    });
    await inventory.create({
      category: "dairy",
      id: "inventory_milk",
      name: "Milk",
      now: "2026-07-06T01:02:03.000Z",
      quantity: 1,
      unit: "l",
      userId: "profile_test",
    });
    await inventory.create({
      category: "grain",
      id: "inventory_other_rice",
      name: "Rice",
      now: "2026-07-06T01:02:03.000Z",
      quantity: 9,
      unit: "go",
      userId: "profile_other",
    });

    await expect(
      inventory.listByUserIdAndIds("profile_test", [
        "inventory_rice",
        "inventory_other_rice",
        "inventory_rice",
      ]),
    ).resolves.toEqual([rice]);
    await expect(inventory.listByUserIdAndIds("profile_test", [])).resolves.toEqual([]);
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
