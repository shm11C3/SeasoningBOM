import { Button } from "@primer/react";
import type { ReactNode } from "react";
import { cloneElement, isValidElement, useEffect, useId, useMemo, useState } from "react";
import { useCloudApi } from "../../app/providers/CloudApiProvider";
import { useCloudProfile } from "../../app/providers/CloudProfileProvider";
import {
  calculateLifecycleStatus,
  defaultSettings,
  type IngredientCategory,
  type InventoryItem,
  ingredientCategories,
  type Unit,
  units,
} from "../../domain";
import type {
  CloudInventoryWriteInput,
  SeasoningBomApiClient,
} from "../../repositories/cloud-api/SeasoningBomApiClient";
import { EmptyState } from "../../ui/components/EmptyState";
import { LifecycleLabel } from "../../ui/components/Labels";
import { PlusIcon, TrashIcon } from "../../ui/components/TemporaryIcons";
import { createId, formatQuantity } from "../format";
import { useLiveData } from "../useLiveData";

type InventoryDraft = {
  id?: string;
  name: string;
  category: IngredientCategory;
  quantity: string;
  unit: Unit;
  bestBeforeDate: string;
  useByDate: string;
  hazardous: boolean;
  createdAt?: string;
};

const emptyDraft: InventoryDraft = {
  name: "",
  category: "produce",
  quantity: "1",
  unit: "piece",
  bestBeforeDate: "",
  useByDate: "",
  hazardous: false,
};

export function InventoryPage() {
  const api = useCloudApi();
  return api ? <CloudInventoryPage api={api} /> : <LocalInventoryPage />;
}

function LocalInventoryPage() {
  const { repositories, inventoryItems, settings } = useLiveData();
  return (
    <InventoryManager
      description="Inventory packages stored locally in IndexedDB."
      inventoryItems={inventoryItems}
      onDelete={async (item) => {
        await repositories.inventory.delete(item.id);
        return true;
      }}
      onSave={async ({ createdAt, id, ...input }) => {
        const timestamp = new Date().toISOString();
        await repositories.inventory.save({
          ...input,
          createdAt: createdAt ?? timestamp,
          id: id ?? createId("inventory"),
          updatedAt: timestamp,
        });
      }}
      settings={settings}
    />
  );
}

function CloudInventoryPage({ api }: { api: SeasoningBomApiClient }) {
  const cloudProfile = useCloudProfile();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error" }
    | { inventoryItems: InventoryItem[]; status: "ready" }
  >({ status: "loading" });

  useEffect(() => {
    if (cloudProfile.status !== "ready") {
      setState({ status: "loading" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    api.listInventory(controller.signal).then(
      (inventoryItems) => {
        if (!controller.signal.aborted) {
          setState({ inventoryItems, status: "ready" });
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setState({ status: "error" });
        }
      },
    );
    return () => controller.abort();
  }, [api, cloudProfile.status]);

  if (cloudProfile.status === "disabled") {
    return (
      <EmptyState title="Inventory unavailable">
        Authentication must be configured before private inventory can be used.
      </EmptyState>
    );
  }
  if (cloudProfile.status === "signed-out") {
    return (
      <EmptyState title="Sign in to manage inventory">
        Your ingredients and expiry dates stay private to your account.
      </EmptyState>
    );
  }
  if (cloudProfile.status === "needs-profile") {
    return (
      <EmptyState title="Choose your User Handle">
        Finish profile setup above before adding private inventory.
      </EmptyState>
    );
  }
  if (cloudProfile.status === "error") {
    return (
      <EmptyState title="Profile unavailable">
        Your private inventory could not be opened. Please try again.
      </EmptyState>
    );
  }
  if (cloudProfile.status === "loading" || state.status === "loading") {
    return <EmptyState title="Loading inventory">Fetching your private ingredients...</EmptyState>;
  }
  if (state.status === "error") {
    return (
      <EmptyState title="Inventory unavailable">
        Your inventory could not be loaded. Please try again.
      </EmptyState>
    );
  }

  return (
    <InventoryManager
      description="Private inventory stored in Cloudflare D1 and visible only to you."
      inventoryItems={state.inventoryItems}
      onDelete={async (item) => {
        if (!window.confirm(`Delete ${item.name} from your inventory?`)) {
          return false;
        }
        await api.deleteInventoryItem(item.id);
        setState((current) =>
          current.status === "ready"
            ? {
                inventoryItems: current.inventoryItems.filter(
                  (candidate) => candidate.id !== item.id,
                ),
                status: "ready",
              }
            : current,
        );
        return true;
      }}
      onSave={async ({ createdAt: _createdAt, id, ...input }) => {
        const savedItem = id
          ? await api.updateInventoryItem(id, input)
          : await api.createInventoryItem(input);
        setState((current) => {
          if (current.status !== "ready") {
            return current;
          }
          const exists = current.inventoryItems.some((item) => item.id === savedItem.id);
          return {
            inventoryItems: exists
              ? current.inventoryItems.map((item) => (item.id === savedItem.id ? savedItem : item))
              : [...current.inventoryItems, savedItem],
            status: "ready",
          };
        });
      }}
      settings={defaultSettings}
    />
  );
}

type InventorySaveRequest = CloudInventoryWriteInput & {
  createdAt?: string;
  id?: string;
};

function InventoryManager({
  description,
  inventoryItems,
  onDelete,
  onSave,
  settings,
}: {
  description: string;
  inventoryItems: InventoryItem[];
  onDelete: (item: InventoryItem) => Promise<boolean>;
  onSave: (request: InventorySaveRequest) => Promise<void>;
  settings: { deprecatedThresholdDays: number };
}) {
  const now = useMemo(() => new Date(), []);
  const [draft, setDraft] = useState<InventoryDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!draft.name.trim()) {
      setError("Ingredient name is required.");
      return;
    }

    const request: InventorySaveRequest = {
      id: draft.id,
      name: draft.name.trim(),
      category: draft.category,
      quantity: Number(draft.quantity) || 0,
      unit: draft.unit,
      bestBeforeDate: draft.bestBeforeDate || undefined,
      useByDate: draft.useByDate || undefined,
      hazardous: draft.hazardous,
      createdAt: draft.createdAt,
    };

    setSaving(true);
    try {
      await onSave(request);
      setDraft(emptyDraft);
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Inventory save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: InventoryItem) {
    setSaving(true);
    try {
      const deleted = await onDelete(item);
      if (!deleted) {
        return;
      }
      if (draft.id === item.id) {
        setDraft(emptyDraft);
      }
      setError(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Inventory deletion failed.");
    } finally {
      setSaving(false);
    }
  }

  function editItem(item: InventoryItem) {
    setDraft({
      id: item.id,
      name: item.name,
      category: item.category,
      quantity: String(item.quantity),
      unit: item.unit,
      bestBeforeDate: item.bestBeforeDate ?? "",
      useByDate: item.useByDate ?? "",
      hazardous: item.hazardous,
      createdAt: item.createdAt,
    });
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Installed ingredients</h1>
          <p>{description}</p>
        </div>
      </div>

      {error ? (
        <div className="flash flash-danger" role="alert">
          {error}
        </div>
      ) : null}

      <section className="surface readme">
        <div className="form-grid">
          <Field className="span-3" label="Name">
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>
          <Field className="span-2" label="Category">
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value as IngredientCategory })
              }
            >
              {ingredientCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field className="span-2" label="Quantity">
            <input
              min="0"
              step="0.1"
              type="number"
              value={draft.quantity}
              onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
            />
          </Field>
          <Field className="span-2" label="Unit">
            <select
              value={draft.unit}
              onChange={(event) => setDraft({ ...draft, unit: event.target.value as Unit })}
            >
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </Field>
          <Field className="span-3" label="Hazardous">
            <select
              value={draft.hazardous ? "yes" : "no"}
              onChange={(event) => setDraft({ ...draft, hazardous: event.target.value === "yes" })}
            >
              <option value="no">no</option>
              <option value="yes">yes</option>
            </select>
          </Field>
          <Field className="span-3" label="Best-before date">
            <input
              type="date"
              value={draft.bestBeforeDate}
              onChange={(event) => setDraft({ ...draft, bestBeforeDate: event.target.value })}
            />
          </Field>
          <Field className="span-3" label="Use-by date">
            <input
              type="date"
              value={draft.useByDate}
              onChange={(event) => setDraft({ ...draft, useByDate: event.target.value })}
            />
          </Field>
          <div className="span-6 action-row">
            <Button type="button" variant="primary" disabled={saving} onClick={handleSave}>
              <PlusIcon /> {saving ? "Saving..." : draft.id ? "Save ingredient" : "Add ingredient"}
            </Button>
            {draft.id ? (
              <Button type="button" onClick={() => setDraft(emptyDraft)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="inventory-table">
          {inventoryItems.map((item) => {
            const status = calculateLifecycleStatus({
              item,
              now,
              deprecatedThresholdDays: settings.deprecatedThresholdDays,
            });
            return (
              <div className="inventory-row" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <p className="muted">{item.category}</p>
                </div>
                <span>{formatQuantity(item.quantity, item.unit)}</span>
                <span>{item.bestBeforeDate ?? "No EOL"}</span>
                <span>{item.useByDate ?? "No use-by"}</span>
                <LifecycleLabel status={status} />
                <div className="action-row">
                  <Button type="button" onClick={() => editItem(item)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={saving}
                    onClick={() => handleDelete(item)}
                  >
                    <TrashIcon /> Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const childId = isValidElement<{ id?: string }>(children)
    ? (children.props.id ?? generatedId)
    : generatedId;
  const control = isValidElement<{ id?: string }>(children)
    ? cloneElement(children, { id: childId })
    : children;

  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={childId}>{label}</label>
      {control}
    </div>
  );
}
