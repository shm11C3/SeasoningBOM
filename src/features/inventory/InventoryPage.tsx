import { Button } from "@primer/react";
import type { ReactNode } from "react";
import { cloneElement, isValidElement, useId, useMemo, useState } from "react";
import {
  calculateLifecycleStatus,
  type IngredientCategory,
  type InventoryItem,
  ingredientCategories,
  type Unit,
  units,
} from "../../domain";
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
  const { repositories, inventoryItems, settings } = useLiveData();
  const now = useMemo(() => new Date(), []);
  const [draft, setDraft] = useState<InventoryDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!draft.name.trim()) {
      setError("Ingredient name is required.");
      return;
    }

    const timestamp = new Date().toISOString();
    const item: InventoryItem = {
      id: draft.id ?? createId("inventory"),
      name: draft.name.trim(),
      category: draft.category,
      quantity: Number(draft.quantity) || 0,
      unit: draft.unit,
      bestBeforeDate: draft.bestBeforeDate || undefined,
      useByDate: draft.useByDate || undefined,
      hazardous: draft.hazardous,
      createdAt: draft.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    await repositories.inventory.save(item);
    setDraft(emptyDraft);
    setError(null);
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
          <p>Inventory packages stored locally in IndexedDB.</p>
        </div>
      </div>

      {error ? <div className="flash flash-danger">{error}</div> : null}

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
            <Button type="button" variant="primary" onClick={handleSave}>
              <PlusIcon /> {draft.id ? "Save ingredient" : "Add ingredient"}
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
                    onClick={() => repositories.inventory.delete(item.id)}
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
