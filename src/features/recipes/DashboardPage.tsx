import { Button, Label } from "@primer/react";
import { useMemo } from "react";
import { navigate } from "../../app/routes";
import { runNomAudit } from "../../domain";
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

export function DashboardPage() {
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
  const issueCount = audits.reduce((total, audit) => total + audit.summary.totalIssues, 0);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Recipe repositories</h1>
          <p>Local repositories, installed ingredients, and conservative food-safety checks.</p>
        </div>
        <Button type="button" onClick={() => navigate("/repositories/new/edit")}>
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
                <AppLink
                  aria-label={`Open ${recipe.name}`}
                  className="repo-card repo-card-link"
                  key={recipe.id}
                  to={`/repositories/${recipe.slug}`}
                >
                  <div className="repo-title">
                    <RepoIcon />
                    <span className="repo-name">{recipe.name}</span>
                  </div>
                  <p className="muted">{recipe.description}</p>
                  <div className="label-row">
                    <Label>Public</Label>
                    <Label variant="accent">v{recipe.version}</Label>
                    {recipe.tags.map((tag) => (
                      <Label key={tag} variant="secondary">
                        {tag}
                      </Label>
                    ))}
                  </div>
                  <div className="meta-line muted">
                    <span>
                      <PackageIcon /> {recipeComponents.length} dependencies
                    </span>
                    <span>
                      <StarIcon /> {fakeStars(recipe, recipeComponents)}
                    </span>
                    <span>{fakeForks(recipe)} forks</span>
                    <span>
                      <AlertIcon /> {audit?.summary.totalIssues ?? 0} alerts
                    </span>
                  </div>
                </AppLink>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
