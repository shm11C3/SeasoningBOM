import { Label } from "@primer/react";
import { EmptyState } from "../../ui/components/EmptyState";
import { AppLink } from "../../ui/components/Link";
import { RepoIcon } from "../../ui/components/TemporaryIcons";
import { useLiveData } from "../useLiveData";

export function ProfilePage({ username }: { username: string }) {
  const { recipes } = useLiveData();
  const ownedRecipes = recipes.filter((recipe) => recipe.ownerHandle === username);
  const contributionCount = ownedRecipes.length;

  if (ownedRecipes.length === 0) {
    return <EmptyState title="Profile not found">{username}</EmptyState>;
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{username}</h1>
          <p>Repository-style cooking enthusiast</p>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat">
          <strong>{contributionCount}</strong>
          <span className="muted">contributions in the local prototype</span>
        </div>
        <div className="stat">
          <strong>{ownedRecipes.length}</strong>
          <span className="muted">repositories</span>
        </div>
      </div>

      <section className="section">
        <div className="section-header">
          <h2>Pinned repositories</h2>
        </div>
        <div className="grid">
          {ownedRecipes.map((recipe) => (
            <AppLink
              className="repo-card repo-card-link"
              key={recipe.id}
              to={`/${recipe.ownerHandle}/${recipe.slug}`}
            >
              <div className="repo-title">
                <RepoIcon />
                <span className="repo-name">
                  {recipe.ownerHandle}/{recipe.slug}
                </span>
              </div>
              <p className="muted">{recipe.description}</p>
              <div className="label-row">
                <Label>{recipe.visibility}</Label>
                <Label variant="accent">v{recipe.version}</Label>
              </div>
            </AppLink>
          ))}
        </div>
      </section>
    </>
  );
}
