import { Button } from "@primer/react";
import type { ReactNode } from "react";
import { cloneElement, isValidElement, useEffect, useId, useMemo, useState } from "react";
import { navigate } from "../../app/routes";
import {
  type Allergen,
  allergens,
  type DependencyType,
  dependencyTypes,
  type IngredientDependency,
  type RecipeComponent,
  type RecipeRepositoryEntity,
  type Unit,
  units,
} from "../../domain";
import { EmptyState } from "../../ui/components/EmptyState";
import { PlusIcon, TrashIcon } from "../../ui/components/TemporaryIcons";
import { createId, slugify } from "../format";
import { useLiveData } from "../useLiveData";

type RecipeDraft = {
  name: string;
  slug: string;
  description: string;
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
  version: "0.1.0",
  servings: "2",
  tags: "",
  license: "",
  maintainer: "me",
  readme:
    "# New Recipe\n\n## Build\n\n1. Checkout ingredients.\n2. Install dependencies.\n3. Deploy to table.",
};

export function RecipeEditorPage({ slug }: { slug: string }) {
  const { repositories, recipes, components } = useLiveData();
  const isNew = slug === "new";
  const recipe = recipes.find((item) => item.slug === slug);
  const existingComponents = useMemo(
    () => (recipe ? components.filter((component) => component.recipeId === recipe.id) : []),
    [components, recipe],
  );
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>(emptyRecipeDraft);
  const [componentDrafts, setComponentDrafts] = useState<ComponentDraft[]>([
    createEmptyComponentDraft(),
  ]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) {
      setRecipeDraft(emptyRecipeDraft);
      setComponentDrafts([createEmptyComponentDraft()]);
      return;
    }

    if (!recipe) {
      return;
    }

    setRecipeDraft({
      name: recipe.name,
      slug: recipe.slug,
      description: recipe.description ?? "",
      version: recipe.version,
      servings: String(recipe.servings),
      tags: recipe.tags.join(", "),
      license: recipe.license ?? "",
      maintainer: recipe.maintainer ?? "",
      readme: recipe.readme ?? "",
    });
    setComponentDrafts(
      existingComponents.length > 0
        ? existingComponents.map(toComponentDraft)
        : [createEmptyComponentDraft()],
    );
  }, [existingComponents, isNew, recipe]);

  if (!isNew && !recipe) {
    return <EmptyState title="Repository not found">{slug}</EmptyState>;
  }

  async function handleSave() {
    if (!recipeDraft.name.trim()) {
      setError("Recipe name is required.");
      return;
    }

    const timestamp = new Date().toISOString();
    const recipeId = recipe?.id ?? createId("recipe");
    const recipeSlug = slugify(recipeDraft.slug || recipeDraft.name);
    const savedRecipe: RecipeRepositoryEntity = {
      id: recipeId,
      name: recipeDraft.name.trim(),
      slug: recipeSlug,
      description: emptyToUndefined(recipeDraft.description),
      version: recipeDraft.version.trim() || "0.1.0",
      servings: Number(recipeDraft.servings) || 1,
      tags: splitList(recipeDraft.tags),
      license: emptyToUndefined(recipeDraft.license),
      maintainer: emptyToUndefined(recipeDraft.maintainer),
      readme: emptyToUndefined(recipeDraft.readme),
      createdAt: recipe?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    const savedComponents = componentDrafts
      .filter((component) => component.ingredientName.trim())
      .map((component) => toRecipeComponent(component, recipeId));

    await repositories.recipes.save(savedRecipe);
    await repositories.components.saveMany(recipeId, savedComponents);
    navigate(`/repositories/${savedRecipe.slug}`);
  }

  function updateRecipeDraft(field: keyof RecipeDraft, value: string) {
    setRecipeDraft((current) => ({ ...current, [field]: value }));
  }

  function updateComponentDraft(id: string, patch: Partial<ComponentDraft>) {
    setComponentDrafts((current) =>
      current.map((component) => (component.id === id ? { ...component, ...patch } : component)),
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
          <Button
            type="button"
            onClick={() => navigate(isNew ? "/" : `/repositories/${recipeDraft.slug}`)}
          >
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handleSave}>
            Save changes
          </Button>
        </div>
      </div>

      {error ? <div className="flash flash-danger">{error}</div> : null}

      <section className="surface readme">
        <div className="form-grid">
          <Field className="span-4" label="Name">
            <input
              value={recipeDraft.name}
              onChange={(event) => {
                const name = event.target.value;
                updateRecipeDraft("name", name);
                if (!recipeDraft.slug.trim()) {
                  updateRecipeDraft("slug", slugify(name));
                }
              }}
            />
          </Field>
          <Field className="span-4" label="Slug">
            <input
              value={recipeDraft.slug}
              onChange={(event) => updateRecipeDraft("slug", event.target.value)}
            />
          </Field>
          <Field className="span-2" label="Version">
            <input
              value={recipeDraft.version}
              onChange={(event) => updateRecipeDraft("version", event.target.value)}
            />
          </Field>
          <Field className="span-2" label="Servings">
            <input
              min="1"
              type="number"
              value={recipeDraft.servings}
              onChange={(event) => updateRecipeDraft("servings", event.target.value)}
            />
          </Field>
          <Field className="span-6" label="Description">
            <input
              value={recipeDraft.description}
              onChange={(event) => updateRecipeDraft("description", event.target.value)}
            />
          </Field>
          <Field className="span-3" label="Maintainer">
            <input
              value={recipeDraft.maintainer}
              onChange={(event) => updateRecipeDraft("maintainer", event.target.value)}
            />
          </Field>
          <Field className="span-3" label="Recipe license">
            <input
              value={recipeDraft.license}
              onChange={(event) => updateRecipeDraft("license", event.target.value)}
            />
          </Field>
          <Field className="span-12" label="Tags">
            <input
              value={recipeDraft.tags}
              onChange={(event) => updateRecipeDraft("tags", event.target.value)}
            />
          </Field>
          <Field className="span-12" label="README">
            <textarea
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
                <Field className="span-4" label="Notes">
                  <input
                    value={component.notes}
                    onChange={(event) =>
                      updateComponentDraft(component.id, { notes: event.target.value })
                    }
                  />
                </Field>
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

function createEmptyComponentDraft(): ComponentDraft {
  return {
    id: createId("component"),
    ingredientName: "",
    quantity: "1",
    unit: "piece",
    dependencyType: "required",
    required: true,
    allergens: "",
    alternatives: "",
    transitiveDependencies: "",
    notes: "",
  };
}

function toComponentDraft(component: RecipeComponent): ComponentDraft {
  return {
    id: component.id,
    ingredientName: component.ingredientName,
    quantity: String(component.quantity),
    unit: component.unit,
    dependencyType: component.dependencyType,
    required: component.required,
    allergens: component.allergens.join(", "),
    alternatives: component.alternatives.join(", "),
    transitiveDependencies: component.transitiveDependencies
      .map((dependency) => `${dependency.name}: ${dependency.allergens.join(", ")}`)
      .join("\n"),
    notes: component.notes ?? "",
  };
}

function toRecipeComponent(component: ComponentDraft, recipeId: string): RecipeComponent {
  return {
    id: component.id,
    recipeId,
    ingredientName: component.ingredientName.trim(),
    quantity: Number(component.quantity) || 0,
    unit: component.unit,
    dependencyType: component.dependencyType,
    required: component.required,
    allergens: parseAllergens(component.allergens),
    alternatives: splitList(component.alternatives),
    transitiveDependencies: parseTransitiveDependencies(component.transitiveDependencies),
    notes: emptyToUndefined(component.notes),
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
        name: name.trim(),
        dependencyType: "transitive",
        allergens: parseAllergens(allergenText ?? ""),
      };
    });
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
