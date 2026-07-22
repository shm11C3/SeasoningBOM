import { useEffect, useMemo, useState } from "react";
import { useCloudApi } from "../../app/providers/CloudApiProvider";
import { useCloudProfile } from "../../app/providers/CloudProfileProvider";
import { navigate } from "../../app/routes";
import { defaultOwnerHandle, type RecipeRepositoryEntity } from "../../domain";
import {
  CloudApiError,
  type CloudRecipeComponent,
  type CloudRepository,
  type SeasoningBomApiClient,
} from "../../repositories/cloud-api/SeasoningBomApiClient";
import { EmptyState } from "../../ui/components/EmptyState";
import { createId } from "../format";
import { useLiveData } from "../useLiveData";
import {
  type RecipeEditorComponent,
  RecipeEditorForm,
  type RecipeEditorMetadata,
  type RecipeEditorSubmission,
} from "./RecipeEditorForm";

type CloudEditorState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | {
      components: CloudRecipeComponent[];
      repository: CloudRepository;
      status: "ready";
    };

export function RecipeEditorPage({
  ownerHandle = defaultOwnerHandle,
  slug,
}: {
  ownerHandle?: string;
  slug: string;
}) {
  const cloudApi = useCloudApi();
  return cloudApi ? (
    <CloudRecipeEditorPage api={cloudApi} ownerHandle={ownerHandle} slug={slug} />
  ) : (
    <LocalRecipeEditorPage ownerHandle={ownerHandle} slug={slug} />
  );
}

function LocalRecipeEditorPage({ ownerHandle, slug }: { ownerHandle: string; slug: string }) {
  const { repositories, recipes, components } = useLiveData();
  const isNew = slug === "new";
  const recipe = recipes.find((item) => item.ownerHandle === ownerHandle && item.slug === slug);
  const initialComponents = useMemo<RecipeEditorComponent[]>(
    () =>
      recipe
        ? components
            .filter((component) => component.recipeId === recipe.id)
            .map(({ recipeId: _recipeId, ...component }) => component)
        : [],
    [components, recipe],
  );
  const initialMetadata = useMemo(() => (recipe ? toEditorMetadata(recipe) : undefined), [recipe]);

  if (!isNew && !recipe) {
    return <EmptyState title="Repository not found">{slug}</EmptyState>;
  }

  async function handleSave({ components: nextComponents, metadata }: RecipeEditorSubmission) {
    const timestamp = new Date().toISOString();
    const recipeId = recipe?.id ?? createId("recipe");
    const savedRecipe: RecipeRepositoryEntity = {
      ...metadata,
      createdAt: recipe?.createdAt ?? timestamp,
      id: recipeId,
      ownerHandle,
      updatedAt: timestamp,
    };

    await repositories.recipes.save(savedRecipe);
    await repositories.components.saveMany(
      recipeId,
      nextComponents.map((component) => ({ ...component, recipeId })),
    );
    navigate(`/${savedRecipe.ownerHandle}/${savedRecipe.slug}`);
  }

  return (
    <RecipeEditorForm
      initialComponents={initialComponents}
      initialMetadata={initialMetadata}
      isNew={isNew}
      mode="local"
      onCancel={() => navigate(isNew ? "/" : `/${ownerHandle}/${recipe?.slug ?? slug}`)}
      onSave={handleSave}
    />
  );
}

function CloudRecipeEditorPage({
  api,
  ownerHandle,
  slug,
}: {
  api: SeasoningBomApiClient;
  ownerHandle: string;
  slug: string;
}) {
  const cloudProfile = useCloudProfile();
  const isNew = slug === "new";
  const [state, setState] = useState<CloudEditorState>({ status: "loading" });
  const resolvedOwnerHandle = ownerHandle === "me" ? cloudProfile.profile?.username : ownerHandle;
  const initialMetadata = useMemo(
    () => (state.status === "ready" ? toEditorMetadata(state.repository) : undefined),
    [state],
  );

  useEffect(() => {
    if (isNew || cloudProfile.status !== "ready" || !resolvedOwnerHandle) {
      return;
    }
    if (resolvedOwnerHandle !== cloudProfile.profile?.username) {
      setState({ status: "not-found" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    Promise.all([
      api.getRepository(resolvedOwnerHandle, slug, controller.signal),
      api.getRepositoryDependencies(resolvedOwnerHandle, slug, controller.signal),
    ]).then(
      ([repository, dependencies]) => {
        if (!controller.signal.aborted) {
          setState({ components: dependencies.components, repository, status: "ready" });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: error instanceof CloudApiError && error.status === 404 ? "not-found" : "error",
          });
        }
      },
    );

    return () => controller.abort();
  }, [api, cloudProfile.profile?.username, cloudProfile.status, isNew, resolvedOwnerHandle, slug]);

  if (cloudProfile.status === "loading") {
    return <EmptyState title="Loading account">Checking repository access...</EmptyState>;
  }
  if (cloudProfile.status === "signed-out") {
    return <EmptyState title="Sign in required">Sign in to create or edit a recipe.</EmptyState>;
  }
  if (cloudProfile.status === "needs-profile") {
    return <EmptyState title="User Handle required">Reserve your User Handle first.</EmptyState>;
  }
  if (cloudProfile.status !== "ready" || !cloudProfile.profile || !resolvedOwnerHandle) {
    return (
      <EmptyState title="Repository editor unavailable">
        Your account could not be prepared for editing.
      </EmptyState>
    );
  }
  if (resolvedOwnerHandle !== cloudProfile.profile.username) {
    return (
      <EmptyState title="Repository not found">Only the owner can edit this repository.</EmptyState>
    );
  }
  if (!isNew && state.status === "loading") {
    return <EmptyState title="Loading repository">Fetching recipe content...</EmptyState>;
  }
  if (!isNew && state.status === "not-found") {
    return <EmptyState title="Repository not found">{slug}</EmptyState>;
  }
  if (!isNew && state.status === "error") {
    return (
      <EmptyState title="Repository unavailable">
        The repository could not be loaded. Please try again.
      </EmptyState>
    );
  }

  const existing = !isNew && state.status === "ready" ? state : null;
  const editableOwnerHandle = resolvedOwnerHandle;

  async function handleSave({ components, metadata }: RecipeEditorSubmission) {
    const input = {
      components: components.map(toCloudRecipeComponent),
      description: metadata.description,
      license: metadata.license,
      name: metadata.name,
      readme: metadata.readme,
      servings: metadata.servings,
      slug: metadata.slug,
      version: metadata.version,
      visibility: metadata.visibility,
    };
    const repository = isNew
      ? await api.createRepository(input)
      : await api.updateRepository(editableOwnerHandle, slug, input);
    navigate(`/${repository.ownerHandle}/${repository.slug}`);
  }

  return (
    <RecipeEditorForm
      initialComponents={existing?.components}
      initialMetadata={initialMetadata}
      isNew={isNew}
      mode="cloud"
      onCancel={() => navigate(isNew ? "/" : `/${editableOwnerHandle}/${slug}`)}
      onSave={handleSave}
    />
  );
}

function toEditorMetadata(
  repository: RecipeRepositoryEntity | CloudRepository,
): RecipeEditorMetadata {
  return {
    description: repository.description,
    license: repository.license,
    maintainer: repository.maintainer,
    name: repository.name,
    readme: repository.readme,
    servings: repository.servings,
    slug: repository.slug,
    tags: repository.tags,
    version: repository.version,
    visibility: repository.visibility,
  };
}

function toCloudRecipeComponent(component: RecipeEditorComponent): CloudRecipeComponent {
  return {
    allergens: component.allergens,
    alternatives: component.alternatives,
    dependencyType: component.dependencyType,
    id: component.id,
    ingredientName: component.ingredientName,
    quantity: component.quantity,
    required: component.required,
    transitiveDependencies: component.transitiveDependencies,
    unit: component.unit,
  };
}
