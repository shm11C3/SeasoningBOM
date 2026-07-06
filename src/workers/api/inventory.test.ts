import { describe, expect, it } from "vitest";
import type {
  CloudInventoryItem,
  CreateInventoryItemInput,
  InventoryItemRepository,
  UpdateInventoryItemInput,
} from "../../repositories/cloudflare-d1/D1InventoryRepository";
import type { UserProfile } from "../../repositories/cloudflare-d1/D1UserProfileRepository";
import {
  handleDeleteInventory,
  handleListInventory,
  handlePatchInventory,
  handlePostInventory,
} from "./inventory";
import type { D1Database, WorkerEnv } from "./types";

const env: WorkerEnv = {
  DB: {} as D1Database,
};

const owner: UserProfile = {
  authProvider: "clerk",
  authSubject: "user_test",
  contributionVisibility: "summary_only",
  createdAt: "2026-07-06T00:00:00.000Z",
  displayName: "Test User",
  id: "profile_test",
  updatedAt: "2026-07-06T00:00:00.000Z",
  username: "test-user",
};

const otherOwner: UserProfile = {
  ...owner,
  authSubject: "user_other",
  id: "profile_other",
  username: "other-user",
};

const rice: CloudInventoryItem = {
  bestBeforeDate: "2026-07-10",
  category: "grain",
  createdAt: "2026-07-06T00:00:00.000Z",
  hazardous: false,
  id: "inventory_rice",
  name: "Rice",
  quantity: 2,
  unit: "go",
  updatedAt: "2026-07-06T00:00:00.000Z",
  useByDate: "2026-07-12",
  userId: "profile_test",
};

async function parseJson(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("inventory API handlers", () => {
  it("lists inventory for the authenticated owner only", async () => {
    const response = await handleListInventory(owner, env, {
      inventoryItems: createInventoryRepository([
        rice,
        {
          ...rice,
          id: "inventory_other",
          name: "Other Salt",
          userId: "profile_other",
        },
      ]),
    });

    await expect(parseJson(response)).resolves.toEqual({
      inventoryItems: [
        {
          bestBeforeDate: "2026-07-10",
          category: "grain",
          createdAt: "2026-07-06T00:00:00.000Z",
          hazardous: false,
          id: "inventory_rice",
          name: "Rice",
          quantity: 2,
          unit: "go",
          updatedAt: "2026-07-06T00:00:00.000Z",
          useByDate: "2026-07-12",
        },
      ],
    });
    expect(response.status).toBe(200);
  });

  it("creates inventory items for the authenticated owner", async () => {
    const inventoryItems = createInventoryRepository([]);
    const response = await handlePostInventory(
      new Request("https://example.test/api/inventory", {
        body: JSON.stringify({
          bestBeforeDate: "2026-07-10",
          category: "grain",
          name: " Rice ",
          quantity: 2,
          unit: "go",
        }),
        method: "POST",
      }),
      owner,
      env,
      {
        createInventoryItemId: () => "inventory_new",
        inventoryItems,
        now: () => new Date("2026-07-06T01:02:03.000Z"),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      inventoryItem: {
        bestBeforeDate: "2026-07-10",
        category: "grain",
        createdAt: "2026-07-06T01:02:03.000Z",
        hazardous: false,
        id: "inventory_new",
        name: "Rice",
        quantity: 2,
        unit: "go",
        updatedAt: "2026-07-06T01:02:03.000Z",
      },
    });
    expect(response.status).toBe(201);
    await expect(inventoryItems.findByIdForUser(owner.id, "inventory_new")).resolves.toEqual(
      expect.objectContaining({
        id: "inventory_new",
        userId: "profile_test",
      }),
    );
  });

  it("rejects unsafe or malformed inventory input", async () => {
    const response = await handlePostInventory(
      new Request("https://example.test/api/inventory", {
        body: JSON.stringify({
          bestBeforeDate: "2026-02-31",
          category: "grain",
          name: "Rice",
          quantity: 2,
          unit: "go",
        }),
        method: "POST",
      }),
      owner,
      env,
      {
        inventoryItems: createInventoryRepository([]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "validation_failed",
        message: "Best-before date must be YYYY-MM-DD.",
      },
    });
    expect(response.status).toBe(400);
  });

  it.each([
    {
      body: "{",
      message: "Request body must be valid JSON.",
    },
    {
      body: null,
      message: "Request body must be a JSON object.",
    },
    {
      body: [],
      message: "Request body must be a JSON object.",
    },
    {
      body: { category: "grain", quantity: 2, unit: "go" },
      message: "Name must be 1-120 characters.",
    },
    {
      body: { category: "unknown", name: "Rice", quantity: 2, unit: "go" },
      message: "Category must be a known inventory category.",
    },
    {
      body: { category: "grain", name: "Rice", quantity: -1, unit: "go" },
      message: "Quantity must be a finite number greater than or equal to 0.",
    },
    {
      body: '{"category":"grain","name":"Rice","quantity":1e999,"unit":"go"}',
      message: "Quantity must be a finite number greater than or equal to 0.",
    },
    {
      body: { category: "grain", name: "Rice", quantity: 2, unit: "scoop" },
      message: "Unit must be a known recipe unit.",
    },
    {
      body: { category: "grain", name: "Rice", quantity: 2, unit: "go", useByDate: "tomorrow" },
      message: "Use-by date must be YYYY-MM-DD.",
    },
    {
      body: { category: "grain", hazardous: "maybe", name: "Rice", quantity: 2, unit: "go" },
      message: "Hazardous must be a boolean.",
    },
    {
      body: { category: "grain", hazardous: null, name: "Rice", quantity: 2, unit: "go" },
      message: "Hazardous must be a boolean.",
    },
  ])("rejects invalid inventory creation body: $message", async ({ body, message }) => {
    const requestBody = typeof body === "string" ? body : JSON.stringify(body);
    const response = await handlePostInventory(
      new Request("https://example.test/api/inventory", {
        body: requestBody,
        method: "POST",
      }),
      owner,
      env,
      {
        inventoryItems: createInventoryRepository([]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "validation_failed",
        message,
      },
    });
    expect(response.status).toBe(400);
  });

  it("returns a JSON error when inventory creation fails", async () => {
    const response = await handlePostInventory(
      new Request("https://example.test/api/inventory", {
        body: JSON.stringify({
          category: "grain",
          name: "Rice",
          quantity: 2,
          unit: "go",
        }),
        method: "POST",
      }),
      owner,
      env,
      {
        inventoryItems: {
          ...createInventoryRepository([]),
          async create() {
            throw new Error("D1 unavailable");
          },
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to create inventory item.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("updates inventory items for the owner", async () => {
    const inventoryItems = createInventoryRepository([rice]);
    const response = await handlePatchInventory(
      new Request("https://example.test/api/inventory/inventory_rice", {
        body: JSON.stringify({
          bestBeforeDate: "",
          hazardous: true,
          quantity: 3,
        }),
        method: "PATCH",
      }),
      "inventory_rice",
      owner,
      env,
      {
        inventoryItems,
        now: () => new Date("2026-07-06T02:03:04.000Z"),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      inventoryItem: expect.objectContaining({
        hazardous: true,
        id: "inventory_rice",
        quantity: 3,
        updatedAt: "2026-07-06T02:03:04.000Z",
      }),
    });
    expect(response.status).toBe(200);
    await expect(inventoryItems.findByIdForUser(owner.id, "inventory_rice")).resolves.toEqual(
      expect.objectContaining({
        bestBeforeDate: undefined,
        hazardous: true,
        quantity: 3,
      }),
    );
  });

  it("hides inventory updates from non-owners", async () => {
    const response = await handlePatchInventory(
      new Request("https://example.test/api/inventory/inventory_rice", {
        body: JSON.stringify({ quantity: 3 }),
        method: "PATCH",
      }),
      "inventory_rice",
      otherOwner,
      env,
      {
        inventoryItems: createInventoryRepository([rice]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Inventory item not found.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("requires at least one inventory update field", async () => {
    const response = await handlePatchInventory(
      new Request("https://example.test/api/inventory/inventory_rice", {
        body: JSON.stringify({}),
        method: "PATCH",
      }),
      "inventory_rice",
      owner,
      env,
      {
        inventoryItems: createInventoryRepository([rice]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "validation_failed",
        message: "At least one inventory field must be provided.",
      },
    });
    expect(response.status).toBe(400);
  });

  it.each([
    {
      body: "{",
      message: "Request body must be valid JSON.",
    },
    {
      body: null,
      message: "Request body must be a JSON object.",
    },
    {
      body: { name: "" },
      message: "Name must be 1-120 characters.",
    },
    {
      body: { category: "unknown" },
      message: "Category must be a known inventory category.",
    },
    {
      body: '{"quantity":1e999}',
      message: "Quantity must be a finite number greater than or equal to 0.",
    },
    {
      body: { unit: "scoop" },
      message: "Unit must be a known recipe unit.",
    },
    {
      body: { bestBeforeDate: 20260710 },
      message: "Best-before date must be YYYY-MM-DD.",
    },
    {
      body: { useByDate: "2026-02-31" },
      message: "Use-by date must be YYYY-MM-DD.",
    },
    {
      body: { hazardous: null },
      message: "Hazardous must be a boolean.",
    },
  ])("rejects invalid inventory update body: $message", async ({ body, message }) => {
    const requestBody = typeof body === "string" ? body : JSON.stringify(body);
    const response = await handlePatchInventory(
      new Request("https://example.test/api/inventory/inventory_rice", {
        body: requestBody,
        method: "PATCH",
      }),
      "inventory_rice",
      owner,
      env,
      {
        inventoryItems: createInventoryRepository([rice]),
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "validation_failed",
        message,
      },
    });
    expect(response.status).toBe(400);
  });

  it("returns a JSON error when inventory update lookup fails", async () => {
    const response = await handlePatchInventory(
      new Request("https://example.test/api/inventory/inventory_rice", {
        body: JSON.stringify({ quantity: 3 }),
        method: "PATCH",
      }),
      "inventory_rice",
      owner,
      env,
      {
        inventoryItems: {
          ...createInventoryRepository([rice]),
          async findByIdForUser() {
            throw new Error("D1 unavailable");
          },
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to update inventory item.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns a JSON error when inventory update fails", async () => {
    const response = await handlePatchInventory(
      new Request("https://example.test/api/inventory/inventory_rice", {
        body: JSON.stringify({ quantity: 3 }),
        method: "PATCH",
      }),
      "inventory_rice",
      owner,
      env,
      {
        inventoryItems: {
          ...createInventoryRepository([rice]),
          async update() {
            throw new Error("D1 unavailable");
          },
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to update inventory item.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns not found when inventory update loses its owned row", async () => {
    const response = await handlePatchInventory(
      new Request("https://example.test/api/inventory/inventory_rice", {
        body: JSON.stringify({ quantity: 3 }),
        method: "PATCH",
      }),
      "inventory_rice",
      owner,
      env,
      {
        inventoryItems: {
          ...createInventoryRepository([rice]),
          async update() {
            return null;
          },
        },
      },
    );

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Inventory item not found.",
      },
    });
    expect(response.status).toBe(404);
  });

  it("deletes inventory items for the owner", async () => {
    const inventoryItems = createInventoryRepository([rice]);
    const response = await handleDeleteInventory("inventory_rice", owner, env, {
      inventoryItems,
    });

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
    await expect(inventoryItems.findByIdForUser(owner.id, "inventory_rice")).resolves.toBeNull();
  });

  it("returns a JSON error when inventory listing fails", async () => {
    const response = await handleListInventory(owner, env, {
      inventoryItems: {
        ...createInventoryRepository([]),
        async listByUserId() {
          throw new Error("D1 unavailable");
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to load inventory.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns a JSON error when inventory deletion lookup fails", async () => {
    const response = await handleDeleteInventory("inventory_rice", owner, env, {
      inventoryItems: {
        ...createInventoryRepository([rice]),
        async findByIdForUser() {
          throw new Error("D1 unavailable");
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to delete inventory item.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("returns a JSON error when inventory deletion fails", async () => {
    const response = await handleDeleteInventory("inventory_rice", owner, env, {
      inventoryItems: {
        ...createInventoryRepository([rice]),
        async deleteForUser() {
          throw new Error("D1 unavailable");
        },
      },
    });

    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Failed to delete inventory item.",
      },
    });
    expect(response.status).toBe(500);
  });
});

function createInventoryRepository(initialItems: CloudInventoryItem[]): InventoryItemRepository {
  const items = [...initialItems];

  return {
    async create(input: CreateInventoryItemInput) {
      const item: CloudInventoryItem = {
        bestBeforeDate: input.bestBeforeDate,
        category: input.category,
        createdAt: input.now,
        hazardous: input.hazardous ?? false,
        id: input.id,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        updatedAt: input.now,
        useByDate: input.useByDate,
        userId: input.userId,
      };
      items.push(item);
      return item;
    },
    async deleteForUser(userId, id) {
      const index = items.findIndex((item) => item.userId === userId && item.id === id);
      if (index >= 0) {
        items.splice(index, 1);
      }
    },
    async findByIdForUser(userId, id) {
      return items.find((item) => item.userId === userId && item.id === id) ?? null;
    },
    async listByUserId(userId) {
      return items.filter((item) => item.userId === userId);
    },
    async update(input: UpdateInventoryItemInput) {
      const item: CloudInventoryItem = {
        bestBeforeDate: input.bestBeforeDate,
        category: input.category,
        createdAt: input.createdAt,
        hazardous: input.hazardous,
        id: input.id,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        updatedAt: input.now,
        useByDate: input.useByDate,
        userId: input.userId,
      };
      const index = items.findIndex(
        (storedItem) => storedItem.id === input.id && storedItem.userId === input.userId,
      );
      if (index < 0) {
        return null;
      }
      items[index] = item;
      return item;
    },
  };
}
