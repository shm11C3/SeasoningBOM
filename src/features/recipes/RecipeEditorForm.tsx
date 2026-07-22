import { Button } from "@primer/react";
import type { ReactNode } from "react";
import { cloneElement, isValidElement, useEffect, useId, useState } from "react";
import {
  type Allergen,
  allergens,
  type DependencyType,
  dependencyTypes,
  type IngredientDependency,
  type RecipeComponent,
  type RecipeRepositoryEntity,
  repositoryVisibilities,
  type Unit,
  units,
} from "../../domain";
import { PlusIcon, TrashIcon } from "../../ui/components/TemporaryIcons";
import { createId, slugify } from "../format";

export type RecipeEditorMetadata = {
  name: string;
  slug: string;
  description?: string;
  visibility: RecipeRepositoryEntity["visibility"];
  version: string;
  servings: number;
  tags: string[];
  license?: string;
  maintainer?: string;
  readme?: string;
};

export type RecipeEditorComponent = Omit<RecipeComponent, "recipeId">;

export type RecipeEditorSubmission = {
  components: RecipeEditorComponent[];
  metadata: RecipeEditorMetadata;
};

type RecipeDraft = {
  name: string;
  slug: string;
  description: string;
  visibility: RecipeRepositoryEntity["visibility"];
  version: string;
  servings: string;
  tags: string;
  license: string;
  maintainer: string;
  readme: string;
};

type ComponentDraft = {
  id: string;
  ingredientName: string;
  quantity: string;
  unit: Unit;
  dependencyType: DependencyType;
  required: boolean;
  allergens: string;
  alternatives: string;
  transitiveDependencies: string;
  notes: string;
};

const emptyRecipeDraft: RecipeDraft = {
  name: "",
  slug: "",
  description: "",
  visibility: "public",
  version: "0.1.0",
  servings: "2",
  tags: "",
  license: "",
  maintainer: "me",
  readme:
    "# New Recipe\n\n## Build\n\n1. Checkout ingredients.\n2. Install dependencies.\n3. Deploy to table.",
};
const noInitialComponents: RecipeEditorComponent[] = [];

export function RecipeEditorForm({
  initialComponents = noInitialComponents,
  initialMetadata,
  isNew,
  mode,
  onCancel,
  onSave,
}: {
  initialComponents?: RecipeEditorComponent[];
  initialMetadata?: RecipeEditorMetadata;
  isNew: boolean;
  mode: "cloud" | "local";
  onCancel: () => void;
  onSave: (submission: RecipeEditorSubmission) => Promise<void>;
}) {
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>(emptyRecipeDraft);
  const [componentDrafts, setComponentDrafts] = useState<ComponentDraft[]>([
    createEmptyComponentDraft(),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);

  useEffect(() => {
    setRecipeDraft(initialMetadata ? toRecipeDraft(initialMetadata) : emptyRecipeDraft);
    setComponentDrafts(
      initialComponents.length > 0
        ? initialComponents.map(toComponentDraft)
        : [createEmptyComponentDraft()],
    );
    setError(null);
    setSlugEdited(Boolean(initialMetadata));
  }, [initialComponents, initialMetadata]);

  async function handleSave() {
    if (!recipeDraft.name.trim()) {
      setError("Recipe name is required.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onSave({
        components: componentDrafts
          .filter((component) => component.ingredientName.trim())
          .map(toRecipeComponent),
        metadata: {
          description: emptyToUndefined(recipeDraft.description),
          license: emptyToUndefined(recipeDraft.license),
          maintainer: emptyToUndefined(recipeDraft.maintainer),
          name: recipeDraft.name.trim(),
          readme: emptyToUndefined(recipeDraft.readme),
          servings: Number(recipeDraft.servings) || 1,
          slug: slugify(recipeDraft.slug || recipeDraft.name),
          tags: splitList(recipeDraft.tags),
          version: recipeDraft.version.trim() || "0.1.0",
          visibility: recipeDraft.visibility,
        },
      });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Repository save failed.");
    } finally {
      setSaving(false);
    }
  }

  function updateRecipeDraft(field: keyof RecipeDraft, value: RecipeDraft[typeof field]) {
    setRecipeDraft((current) => ({ ...current, [field]: value }));
  }

  function updateComponentDraft(id: string, value: Partial<ComponentDraft>) {
    setComponentDrafts((current) =>
      current.map((component) => (component.id === id ? { ...component, ...value } : component)),
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{isNew ? "New recipe repository" : `Edit ${recipeDraft.name}`}</h1>
          <p>Recipe metadata and dependency manifest.</p>
        </div>
        <div className="action-row">
          <Button disabled={saving} type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={saving} type="button" variant="primary" onClick={handleSave}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flash flash-danger" role="alert">
          {error}
        </div>
      ) : null}

      <section className="surface readme">
        <div className="form-grid">
          <Field className="span-4" label="Name">
            <input
              maxLength={120}
              value={recipeDraft.name}
              onChange={(event) => {
                const name = event.target.value;
                updateRecipeDraft("name", name);
                if (!slugEdited) {
                  updateRecipeDraft("slug", slugify(name));
                }
              }}
            />
          </Field>
          <Field className="span-4" label="Slug">
            <input
              maxLength={80}
              pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
              value={recipeDraft.slug}
              onChange={(event) => {
                setSlugEdited(true);
                updateRecipeDraft("slug", event.target.value.toLowerCase());
              }}
            />
          </Field>
          <Field className="span-2" label="Version">
            <input
              maxLength={32}
              value={recipeDraft.version}
              onChange={(event) => updateRecipeDraft("version", event.target.value)}
            />
          </Field>
          <Field className="span-2" label="Servings">
            <input
              max="999"
              min="1"
              type="number"
              value={recipeDraft.servings}
              onChange={(event) => updateRecipeDraft("servings", event.target.value)}
            />
          </Field>
          <Field className="span-6" label="Description">
            <input
              maxLength={280}
              value={recipeDraft.description}
              onChange={(event) => updateRecipeDraft("description", event.target.value)}
            />
          </Field>
          <Field className="span-3" label="Visibility">
            <select
              value={recipeDraft.visibility}
              onChange={(event) =>
                updateRecipeDraft(
                  "visibility",
                  event.target.value as RecipeRepositoryEntity["visibility"],
                )
              }
            >
              {repositoryVisibilities.map((visibility) => (
                <option key={visibility} value={visibility}>
                  {visibility}
                </option>
              ))}
            </select>
          </Field>
          <Field className="span-3" label="Recipe license">
            <input
              maxLength={120}
              value={recipeDraft.license}
              onChange={(event) => updateRecipeDraft("license", event.target.value)}
            />
          </Field>
          {mode === "local" ? (
            <>
              <Field className="span-3" label="Maintainer">
                <input
                  value={recipeDraft.maintainer}
                  onChange={(event) => updateRecipeDraft("maintainer", event.target.value)}
                />
              </Field>
              <Field className="span-12" label="Tags">
                <input
                  value={recipeDraft.tags}
                  onChange={(event) => updateRecipeDraft("tags", event.target.value)}
                />
              </Field>
            </>
          ) : null}
          <Field className="span-12" label="README">
            <textarea
              maxLength={20_000}
              value={recipeDraft.readme}
              onChange={(event) => updateRecipeDraft("readme", event.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Dependencies</h2>
          <Button
            type="button"
            onClick={() =>
              setComponentDrafts((current) => [...current, createEmptyComponentDraft()])
            }
          >
            <PlusIcon /> Add dependency
          </Button>
        </div>
        <div className="inventory-table">
          {componentDrafts.map((component) => (
            <div className="component-editor" key={component.id}>
              <div className="form-grid">
                <Field className="span-4" label="Ingredient">
                  <input
                    maxLength={120}
                    value={component.ingredientName}
                    onChange={(event) =>
                      updateComponentDraft(component.id, { ingredientName: event.target.value })
                    }
                  />
                </Field>
                <Field className="span-2" label="Quantity">
                  <input
                    min="0"
                    step="0.1"
                    type="number"
                    value={component.quantity}
                    onChange={(event) =>
                      updateComponentDraft(component.id, { quantity: event.target.value })
                    }
                  />
                </Field>
                <Field className="span-2" label="Unit">
                  <select
                    value={component.unit}
                    onChange={(event) =>
                      updateComponentDraft(component.id, { unit: event.target.value as Unit })
                    }
                  >
                    {units.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field className="span-2" label="Type">
                  <select
                    value={component.dependencyType}
                    onChange={(event) =>
                      updateComponentDraft(component.id, {
                        dependencyType: event.target.value as DependencyType,
                      })
                    }
                  >
                    {dependencyTypes.map((dependencyType) => (
                      <option key={dependencyType} value={dependencyType}>
                        {dependencyType}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field className="span-2" label="Required">
                  <select
                    value={component.required ? "yes" : "no"}
                    onChange={(event) =>
                      updateComponentDraft(component.id, { required: event.target.value === "yes" })
                    }
                  >
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </Field>
                <Field className="span-4" label="Allergens">
                  <input
                    value={component.allergens}
                    onChange={(event) =>
                      updateComponentDraft(component.id, { allergens: event.target.value })
                    }
                  />
                </Field>
                <Field className="span-4" label="Alternatives">
                  <input
                    value={component.alternatives}
                    onChange={(event) =>
                      updateComponentDraft(component.id, { alternatives: event.target.value })
                    }
                  />
                </Field>
                {mode === "local" ? (
                  <Field className="span-4" label="Notes">
                    <input
                      value={component.notes}
                      onChange={(event) =>
                        updateComponentDraft(component.id, { notes: event.target.value })
                      }
                    />
                  </Field>
                ) : null}
                <Field className="span-12" label="Transitive dependencies">
                  <textarea
                    value={component.transitiveDependencies}
                    onChange={(event) =>
                      updateComponentDraft(component.id, {
                        transitiveDependencies: event.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <div className="action-row">
                <Button
                  type="button"
                  variant="danger"
                  onClick={() =>
                    setComponentDrafts((current) =>
                      current.filter((item) => item.id !== component.id),
                    )
                  }
                >
                  <TrashIcon /> Remove dependency
                </Button>
              </div>
            </div>
          ))}
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

function toRecipeDraft(metadata: RecipeEditorMetadata): RecipeDraft {
  return {
    description: metadata.description ?? "",
    license: metadata.license ?? "",
    maintainer: metadata.maintainer ?? "",
    name: metadata.name,
    readme: metadata.readme ?? "",
    servings: String(metadata.servings),
    slug: metadata.slug,
    tags: metadata.tags.join(", "),
    version: metadata.version,
    visibility: metadata.visibility,
  };
}

function createEmptyComponentDraft(): ComponentDraft {
  return {
    allergens: "",
    alternatives: "",
    dependencyType: "required",
    id: createId("component"),
    ingredientName: "",
    notes: "",
    quantity: "1",
    required: true,
    transitiveDependencies: "",
    unit: "piece",
  };
}

function toComponentDraft(component: RecipeEditorComponent): ComponentDraft {
  return {
    allergens: component.allergens.join(", "),
    alternatives: component.alternatives.join(", "),
    dependencyType: component.dependencyType,
    id: component.id,
    ingredientName: component.ingredientName,
    notes: component.notes ?? "",
    quantity: String(component.quantity),
    required: component.required,
    transitiveDependencies: component.transitiveDependencies
      .map((dependency) => `${dependency.name}: ${dependency.allergens.join(", ")}`)
      .join("\n"),
    unit: component.unit,
  };
}

function toRecipeComponent(component: ComponentDraft): RecipeEditorComponent {
  return {
    allergens: parseAllergens(component.allergens),
    alternatives: splitList(component.alternatives),
    dependencyType: component.dependencyType,
    id: component.id,
    ingredientName: component.ingredientName.trim(),
    notes: emptyToUndefined(component.notes),
    quantity: Number(component.quantity) || 0,
    required: component.required,
    transitiveDependencies: parseTransitiveDependencies(component.transitiveDependencies),
    unit: component.unit,
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseAllergens(value: string): Allergen[] {
  const knownAllergens = new Set<string>(allergens);
  return splitList(value).flatMap((item) => (knownAllergens.has(item) ? [item as Allergen] : []));
}

function parseTransitiveDependencies(value: string): IngredientDependency[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, allergenText] = line.split(":");
      return {
        allergens: parseAllergens(allergenText ?? ""),
        dependencyType: "transitive",
        name: name.trim(),
      };
    });
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
