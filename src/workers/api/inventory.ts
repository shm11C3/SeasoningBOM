import {
  type IngredientCategory,
  type InventoryItem,
  ingredientCategories,
  type Unit,
  units,
} from "../../domain";
import {
  type CloudInventoryItem,
  D1InventoryRepository,
  type InventoryItemRepository,
} from "../../repositories/cloudflare-d1/D1InventoryRepository";
import type { UserProfile } from "../../repositories/cloudflare-d1/D1UserProfileRepository";
import type { ClerkAuthenticationOptions } from "../auth/clerk";
import type { ProfileRouteOptions } from "./profile";
import { badRequest, jsonResponse, serverError } from "./responses";
import type { WorkerEnv } from "./types";

export type InventoryRouteOptions = ClerkAuthenticationOptions &
  ProfileRouteOptions & {
    createInventoryItemId?: () => string;
    inventoryItems?: InventoryItemRepository;
    now?: () => Date;
  };

type InventoryResponseBody = {
  inventoryItem: SerializedInventoryItem;
};

type InventoryListResponseBody = {
  inventoryItems: SerializedInventoryItem[];
};

type SerializedInventoryItem = {
  id: string;
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: Unit;
  bestBeforeDate?: string;
  useByDate?: string;
  hazardous: boolean;
  createdAt: string;
  updatedAt: string;
};

type InventoryItemBody = {
  bestBeforeDate?: unknown;
  category?: unknown;
  hazardous?: unknown;
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  useByDate?: unknown;
};

const inventoryCategoriesSet = new Set<string>(ingredientCategories);
const inventoryUnitsSet = new Set<string>(units);
const updateInventoryFields = [
  "bestBeforeDate",
  "category",
  "hazardous",
  "name",
  "quantity",
  "unit",
  "useByDate",
];

export async function handleListInventory(
  owner: UserProfile,
  env: WorkerEnv,
  options: InventoryRouteOptions = {},
): Promise<Response> {
  const inventory = getInventoryRepository(env, options);

  try {
    const items = await inventory.listByUserId(owner.id);
    return jsonResponse({
      inventoryItems: items.map(serializeInventoryItem),
    } satisfies InventoryListResponseBody);
  } catch {
    return serverError("Failed to load inventory.");
  }
}

export async function handlePostInventory(
  request: Request,
  owner: UserProfile,
  env: WorkerEnv,
  options: InventoryRouteOptions = {},
): Promise<Response> {
  const inventory = getInventoryRepository(env, options);
  const body = await readInventoryBody(request);
  if (!body.ok) {
    return badRequest(body.message);
  }

  const input = normalizeCreateInventoryBody(body.value);
  if (!input.ok) {
    return badRequest(input.message);
  }

  const now = (options.now?.() ?? new Date()).toISOString();
  const id = options.createInventoryItemId?.() ?? crypto.randomUUID();

  try {
    const item = await inventory.create({
      ...input.value,
      id,
      userId: owner.id,
      now,
    });

    return jsonResponse(serializeInventoryResponse(item), { status: 201 });
  } catch {
    return serverError("Failed to create inventory item.");
  }
}

export async function handlePatchInventory(
  request: Request,
  id: string,
  owner: UserProfile,
  env: WorkerEnv,
  options: InventoryRouteOptions = {},
): Promise<Response> {
  const inventory = getInventoryRepository(env, options);
  const currentResult = await findOwnedInventoryItem(
    inventory,
    owner.id,
    id,
    "Failed to update inventory item.",
  );
  if (!currentResult.ok) {
    return currentResult.response;
  }

  const body = await readInventoryBody(request);
  if (!body.ok) {
    return badRequest(body.message);
  }

  const input = normalizeUpdateInventoryBody(body.value, currentResult.item);
  if (!input.ok) {
    return badRequest(input.message);
  }

  const now = (options.now?.() ?? new Date()).toISOString();

  try {
    const item = await inventory.update({
      ...input.value,
      id: currentResult.item.id,
      userId: currentResult.item.userId,
      createdAt: currentResult.item.createdAt,
      now,
    });

    return jsonResponse(serializeInventoryResponse(item));
  } catch {
    return serverError("Failed to update inventory item.");
  }
}

export async function handleDeleteInventory(
  id: string,
  owner: UserProfile,
  env: WorkerEnv,
  options: InventoryRouteOptions = {},
): Promise<Response> {
  const inventory = getInventoryRepository(env, options);
  const currentResult = await findOwnedInventoryItem(
    inventory,
    owner.id,
    id,
    "Failed to delete inventory item.",
  );
  if (!currentResult.ok) {
    return currentResult.response;
  }

  try {
    await inventory.deleteForUser(owner.id, currentResult.item.id);
    return new Response(null, { status: 204 });
  } catch {
    return serverError("Failed to delete inventory item.");
  }
}

function getInventoryRepository(
  env: WorkerEnv,
  options: InventoryRouteOptions,
): InventoryItemRepository {
  return options.inventoryItems ?? new D1InventoryRepository(env.DB);
}

async function findOwnedInventoryItem(
  inventory: InventoryItemRepository,
  userId: string,
  id: string,
  failureMessage: string,
): Promise<{ ok: true; item: CloudInventoryItem } | { ok: false; response: Response }> {
  try {
    const item = await inventory.findByIdForUser(userId, id);
    if (!item) {
      return { ok: false, response: inventoryItemNotFound() };
    }

    return { ok: true, item };
  } catch {
    return { ok: false, response: serverError(failureMessage) };
  }
}

async function readInventoryBody(
  request: Request,
): Promise<{ ok: true; value: InventoryItemBody } | { message: string; ok: false }> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { message: "Request body must be a JSON object.", ok: false };
    }

    return { ok: true, value: body };
  } catch {
    return { message: "Request body must be valid JSON.", ok: false };
  }
}

function normalizeCreateInventoryBody(body: InventoryItemBody):
  | {
      ok: true;
      value: Omit<CreateInventoryInput, "id" | "now" | "userId">;
    }
  | { message: string; ok: false } {
  const name = normalizeRequiredText(body.name, 120);
  if (!name) {
    return { message: "Name must be 1-120 characters.", ok: false };
  }

  const category = normalizeCategory(body.category);
  if (!category) {
    return { message: "Category must be a known inventory category.", ok: false };
  }

  const quantity = normalizeQuantity(body.quantity);
  if (quantity === null) {
    return { message: "Quantity must be a finite number greater than or equal to 0.", ok: false };
  }

  const unit = normalizeUnit(body.unit);
  if (!unit) {
    return { message: "Unit must be a known recipe unit.", ok: false };
  }

  const bestBeforeDate = normalizeOptionalDate(body.bestBeforeDate);
  if (bestBeforeDate === false) {
    return { message: "Best-before date must be YYYY-MM-DD.", ok: false };
  }

  const useByDate = normalizeOptionalDate(body.useByDate);
  if (useByDate === false) {
    return { message: "Use-by date must be YYYY-MM-DD.", ok: false };
  }

  const hazardous = normalizeOptionalBoolean(body.hazardous);
  if (hazardous === null) {
    return { message: "Hazardous must be a boolean.", ok: false };
  }

  return {
    ok: true,
    value: {
      name,
      category,
      quantity,
      unit,
      bestBeforeDate,
      useByDate,
      hazardous,
    },
  };
}

function normalizeUpdateInventoryBody(
  body: InventoryItemBody,
  current: CloudInventoryItem,
):
  | {
      ok: true;
      value: Omit<UpdateInventoryInput, "createdAt" | "id" | "now" | "userId">;
    }
  | { message: string; ok: false } {
  if (!updateInventoryFields.some((field) => Object.hasOwn(body, field))) {
    return { message: "At least one inventory field must be provided.", ok: false };
  }

  const name = Object.hasOwn(body, "name") ? normalizeRequiredText(body.name, 120) : current.name;
  if (!name) {
    return { message: "Name must be 1-120 characters.", ok: false };
  }

  const category = Object.hasOwn(body, "category")
    ? normalizeCategory(body.category)
    : current.category;
  if (!category) {
    return { message: "Category must be a known inventory category.", ok: false };
  }

  const quantity = Object.hasOwn(body, "quantity")
    ? normalizeQuantity(body.quantity)
    : current.quantity;
  if (quantity === null) {
    return { message: "Quantity must be a finite number greater than or equal to 0.", ok: false };
  }

  const unit = Object.hasOwn(body, "unit") ? normalizeUnit(body.unit) : current.unit;
  if (!unit) {
    return { message: "Unit must be a known recipe unit.", ok: false };
  }

  const bestBeforeDate = Object.hasOwn(body, "bestBeforeDate")
    ? normalizeOptionalDate(body.bestBeforeDate)
    : current.bestBeforeDate;
  if (bestBeforeDate === false) {
    return { message: "Best-before date must be YYYY-MM-DD.", ok: false };
  }

  const useByDate = Object.hasOwn(body, "useByDate")
    ? normalizeOptionalDate(body.useByDate)
    : current.useByDate;
  if (useByDate === false) {
    return { message: "Use-by date must be YYYY-MM-DD.", ok: false };
  }

  const hazardous = Object.hasOwn(body, "hazardous")
    ? normalizeRequiredBoolean(body.hazardous)
    : current.hazardous;
  if (hazardous === null) {
    return { message: "Hazardous must be a boolean.", ok: false };
  }

  return {
    ok: true,
    value: {
      name,
      category,
      quantity,
      unit,
      bestBeforeDate,
      useByDate,
      hazardous,
    },
  };
}

type CreateInventoryInput = Parameters<InventoryItemRepository["create"]>[0];
type UpdateInventoryInput = Parameters<InventoryItemRepository["update"]>[0];

function normalizeRequiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function normalizeCategory(value: unknown): IngredientCategory | null {
  return typeof value === "string" && inventoryCategoriesSet.has(value)
    ? (value as IngredientCategory)
    : null;
}

function normalizeUnit(value: unknown): Unit | null {
  return typeof value === "string" && inventoryUnitsSet.has(value) ? (value as Unit) : null;
}

function normalizeQuantity(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function normalizeOptionalDate(value: unknown): string | false | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? false : value;
}

function normalizeOptionalBoolean(value: unknown): boolean | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "boolean" ? value : null;
}

function normalizeRequiredBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function serializeInventoryResponse(item: InventoryItem): InventoryResponseBody {
  return {
    inventoryItem: serializeInventoryItem(item),
  };
}

function serializeInventoryItem(item: InventoryItem): SerializedInventoryItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    bestBeforeDate: item.bestBeforeDate,
    useByDate: item.useByDate,
    hazardous: item.hazardous,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function inventoryItemNotFound(): Response {
  return jsonResponse(
    {
      error: {
        code: "not_found",
        message: "Inventory item not found.",
      },
    },
    { status: 404 },
  );
}
