import { Button, Label } from "@primer/react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useCloudApi } from "../../app/providers/CloudApiProvider";
import { useCloudProfile } from "../../app/providers/CloudProfileProvider";
import { navigate } from "../../app/routes";
import { runNomAudit } from "../../domain";
import type {
  CloudRepository,
  SeasoningBomApiClient,
} from "../../repositories/cloud-api/SeasoningBomApiClient";
import { EmptyState } from "../../ui/components/EmptyState";
import { AppLink } from "../../ui/components/Link";
import {
  AlertIcon,
  PackageIcon,
  PlusIcon,
  RepoIcon,
  StarIcon,
} from "../../ui/components/TemporaryIcons";
import { fakeForks, fakeStars, groupComponentsByRecipeId } from "../format";
import { useLiveData } from "../useLiveData";

type CloudDashboardState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; repositories: CloudRepository[] };

export function DashboardPage() {
  const cloudApi = useCloudApi();
  return cloudApi ? <CloudDashboardPage api={cloudApi} /> : <LocalDashboardPage />;
}

function CloudDashboardPage({ api }: { api: SeasoningBomApiClient }) {
  const cloudProfile = useCloudProfile();
  const [state, setState] = useState<CloudDashboardState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    api.listPublicRepositories(controller.signal).then(
      (repositories) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", repositories });
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setState({ status: "error" });
        }
      },
    );

    return () => controller.abort();
  }, [api]);

  if (state.status === "loading") {
    return <EmptyState title="Loading repositories">Fetching shared recipes...</EmptyState>;
  }

  if (state.status === "error") {
    return (
      <EmptyState title="Repositories unavailable">
        The shared recipe list could not be loaded. Please try again.
      </EmptyState>
    );
  }

  const ownerCount = new Set(state.repositories.map((repository) => repository.ownerHandle)).size;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Recipe repositories</h1>
          <p>Public recipes shared by the SeasoningBOM community.</p>
        </div>
        {cloudProfile.status === "ready" ? (
          <Button type="button" onClick={() => navigate("/new")}>
            <PlusIcon /> New recipe
          </Button>
        ) : null}
      </div>

      <div className="stat-strip">
        <div className="stat">
          <strong>{state.repositories.length}</strong>
          <span className="muted">public repositories</span>
        </div>
        <div className="stat">
          <strong>{ownerCount}</strong>
          <span className="muted">cooks</span>
        </div>
      </div>

      <section>
        <div className="section-header">
          <h2>Repositories</h2>
        </div>
        {state.repositories.length === 0 ? (
          <EmptyState title="No public recipe repositories" />
        ) : (
          <div className="grid">
            {state.repositories.map((repository) => (
              <CloudRepositoryCard key={repository.id} repository={repository} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function CloudRepositoryCard({ repository }: { repository: CloudRepository }) {
  return (
    <RepositoryCardShell
      emptyDescription="No description provided."
      footer={
        <>
          <span>{repository.servings} servings</span>
          {repository.sourceRepositoryId ? (
            <span>Forked from {repository.sourceRepositoryId}</span>
          ) : null}
        </>
      }
      repository={repository}
    />
  );
}

function RepositoryCardShell({
  emptyDescription,
  footer,
  repository,
}: {
  emptyDescription?: string;
  footer: ReactNode;
  repository: Pick<
    CloudRepository,
    "description" | "name" | "ownerHandle" | "slug" | "tags" | "version" | "visibility"
  >;
}) {
  return (
    <AppLink
      aria-label={`Open ${repository.name}`}
      className="repo-card repo-card-link"
      to={`/${repository.ownerHandle}/${repository.slug}`}
    >
      <div className="repo-title">
        <RepoIcon />
        <span className="repo-name">
          {repository.ownerHandle}/{repository.slug}
        </span>
      </div>
      <p className="muted">{repository.description ?? emptyDescription}</p>
      <div className="label-row">
        <Label>{repository.visibility}</Label>
        <Label variant="accent">v{repository.version}</Label>
        {repository.tags.map((tag) => (
          <Label key={tag} variant="secondary">
            {tag}
          </Label>
        ))}
      </div>
      <div className="meta-line muted">{footer}</div>
    </AppLink>
  );
}

function LocalDashboardPage() {
  const { recipes, components, inventoryItems, settings } = useLiveData();
  const now = useMemo(() => new Date(), []);
  const componentsByRecipeId = useMemo(() => groupComponentsByRecipeId(components), [components]);
  const audits = useMemo(
    () =>
      recipes.map((recipe) =>
        runNomAudit({
          recipe,
          components: componentsByRecipeId[recipe.id] ?? [],
          inventoryItems,
          now,
          settings,
        }),
      ),
    [componentsByRecipeId, inventoryItems, now, recipes, settings],
  );
  const issueCount = audits.reduce(
    (total, audit) => total + audit.recipeAlerts.length + audit.inventoryAudit.summary.totalIssues,
    0,
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Recipe repositories</h1>
          <p>Local repositories, installed ingredients, and conservative food-safety checks.</p>
        </div>
        <Button type="button" onClick={() => navigate("/new")}>
          <PlusIcon /> New recipe
        </Button>
      </div>

      <div className="stat-strip">
        <div className="stat">
          <strong>{recipes.length}</strong>
          <span className="muted">repositories</span>
        </div>
        <div className="stat">
          <strong>{inventoryItems.length}</strong>
          <span className="muted">installed ingredients</span>
        </div>
        <div className="stat">
          <strong>{issueCount}</strong>
          <span className="muted">nom audit issues</span>
        </div>
      </div>

      <section>
        <div className="section-header">
          <h2>Repositories</h2>
        </div>
        {recipes.length === 0 ? (
          <EmptyState title="No recipe repositories" />
        ) : (
          <div className="grid">
            {recipes.map((recipe) => {
              const recipeComponents = componentsByRecipeId[recipe.id] ?? [];
              const audit = audits.find((item) => item.recipeId === recipe.id);
              return (
                <RepositoryCardShell
                  footer={
                    <>
                      <span>
                        <PackageIcon /> {recipeComponents.length} dependencies
                      </span>
                      <span>
                        <StarIcon /> {fakeStars(recipe, recipeComponents)}
                      </span>
                      <span>{fakeForks(recipe)} forks</span>
                      <span>
                        <AlertIcon />{" "}
                        {(audit?.recipeAlerts.length ?? 0) +
                          (audit?.inventoryAudit.summary.totalIssues ?? 0)}{" "}
                        alerts
                      </span>
                    </>
                  }
                  key={recipe.id}
                  repository={recipe}
                />
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
