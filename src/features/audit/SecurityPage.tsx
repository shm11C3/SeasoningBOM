import { useMemo } from "react";
import { type AuditSeverity, type InventoryAuditIssue, runNomAudit } from "../../domain";
import { EmptyState } from "../../ui/components/EmptyState";
import { SeverityLabel } from "../../ui/components/Labels";
import { AppLink } from "../../ui/components/Link";
import { ShieldIcon } from "../../ui/components/TemporaryIcons";
import { groupComponentsByRecipeId } from "../format";
import { useLiveData } from "../useLiveData";

type CrossRecipeIssue = InventoryAuditIssue & {
  recipeName: string;
  recipeOwnerHandle: string;
  recipeSlug: string;
};

export function SecurityPage() {
  const { recipes, components, inventoryItems, settings } = useLiveData();
  const now = useMemo(() => new Date(), []);
  const componentsByRecipeId = useMemo(() => groupComponentsByRecipeId(components), [components]);
  const issues = useMemo<CrossRecipeIssue[]>(
    () =>
      recipes.flatMap((recipe) => {
        const audit = runNomAudit({
          recipe,
          components: componentsByRecipeId[recipe.id] ?? [],
          inventoryItems,
          now,
          settings,
        });
        return audit.inventoryAudit.issues.map((issue) => ({
          ...issue,
          recipeName: recipe.name,
          recipeOwnerHandle: recipe.ownerHandle,
          recipeSlug: recipe.slug,
        }));
      }),
    [componentsByRecipeId, inventoryItems, now, recipes, settings],
  );
  const groups = issues.reduce<Record<AuditSeverity, CrossRecipeIssue[]>>(
    (result, issue) => {
      result[issue.severity].push(issue);
      return result;
    },
    { critical: [], high: [], medium: [], low: [] },
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Security alerts</h1>
          <p>Your cross-recipe inventory audit results.</p>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat">
          <strong>{issues.length}</strong>
          <span className="muted">total issues</span>
        </div>
        <div className="stat">
          <strong>{groups.critical.length}</strong>
          <span className="muted">critical</span>
        </div>
        <div className="stat">
          <strong>{groups.high.length}</strong>
          <span className="muted">high</span>
        </div>
      </div>

      {issues.length === 0 ? <EmptyState title="No active security alerts" /> : null}

      {(["critical", "high", "medium", "low"] as const).map((severity) =>
        groups[severity].length > 0 ? (
          <section className="section" key={severity}>
            <div className="section-header">
              <h2>{severity}</h2>
            </div>
            <div className="alert-list">
              {groups[severity].map((issue) => (
                <div className="alert-row" key={`${issue.recipeSlug}-${issue.id}`}>
                  <SeverityLabel severity={issue.severity} />
                  <div>
                    <strong>{issue.message}</strong>
                    {issue.recommendation ? <p className="muted">{issue.recommendation}</p> : null}
                  </div>
                  <AppLink to={`/${issue.recipeOwnerHandle}/${issue.recipeSlug}`}>
                    <ShieldIcon /> {issue.recipeName}
                  </AppLink>
                </div>
              ))}
            </div>
          </section>
        ) : null,
      )}
    </>
  );
}
