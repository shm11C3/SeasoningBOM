import { Button, Label } from "@primer/react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useCloudApi } from "../../app/providers/CloudApiProvider";
import { useCloudProfile } from "../../app/providers/CloudProfileProvider";
import { navigate } from "../../app/routes";
import {
  type AuditIssue,
  calculateLifecycleStatus,
  generateSeasoningBOM,
  generateShoppingList,
  type InventoryAuditResult,
  runNomAudit,
  summarizeIssues,
} from "../../domain";
import {
  CloudApiError,
  type CloudRecipeComponent,
  type CloudRepository,
  type CloudRepositorySecurity,
  type SeasoningBomApiClient,
} from "../../repositories/cloud-api/SeasoningBomApiClient";
import { EmptyState } from "../../ui/components/EmptyState";
import { DependencyLabel, LifecycleLabel, SeverityLabel } from "../../ui/components/Labels";
import { AppLink } from "../../ui/components/Link";
import {
  AlertIcon,
  ChecklistIcon,
  CodeIcon,
  DownloadIcon,
  ForkIcon,
  PackageIcon,
  PencilIcon,
  RepoIcon,
  ShieldIcon,
  StarIcon,
  TrashIcon,
} from "../../ui/components/TemporaryIcons";
import { downloadJson } from "../download";
import { fakeForks, fakeStars, formatQuantity, groupIssuesBySeverity } from "../format";
import { useLiveData } from "../useLiveData";

type Tab = "code" | "dependencies" | "security";

type CloudRepositoryState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | {
      status: "ready";
      repository: CloudRepository;
      components: CloudRecipeComponent[] | null;
      security: CloudRepositorySecurity | null;
    };

type CloudInventoryAuditState =
  | { status: "hidden" }
  | { status: "loading" }
  | { status: "error" }
  | { inventoryAudit: InventoryAuditResult; status: "ready" };

type CloudStarState =
  | { status: "hidden" }
  | { status: "loading" }
  | { status: "error" }
  | { starred: boolean; status: "ready" };

export function RecipeDetailPage({ ownerHandle, slug }: { ownerHandle: string; slug: string }) {
  const cloudApi = useCloudApi();
  return cloudApi ? (
    <CloudRecipeDetailPage api={cloudApi} ownerHandle={ownerHandle} slug={slug} />
  ) : (
    <LocalRecipeDetailPage ownerHandle={ownerHandle} slug={slug} />
  );
}

function LocalRecipeDetailPage({ ownerHandle, slug }: { ownerHandle: string; slug: string }) {
  const { repositories, recipes, components, inventoryItems, settings } = useLiveData();
  const [tab, setTab] = useState<Tab>("code");
  const [message, setMessage] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const recipe = recipes.find((item) => item.ownerHandle === ownerHandle && item.slug === slug);
  const recipeComponents = recipe
    ? components.filter((component) => component.recipeId === recipe.id)
    : [];
  const audit = useMemo(
    () =>
      recipe
        ? runNomAudit({
            recipe,
            components: recipeComponents,
            inventoryItems,
            now,
            settings,
          })
        : null,
    [inventoryItems, now, recipe, recipeComponents, settings],
  );
  const shoppingList = useMemo(
    () =>
      generateShoppingList({
        components: recipeComponents,
        inventoryItems,
        now,
        settings,
      }),
    [inventoryItems, now, recipeComponents, settings],
  );

  if (!recipe) {
    return <EmptyState title="Repository not found">{slug}</EmptyState>;
  }
  const currentRecipe = recipe;

  async function handleDelete() {
    await repositories.recipes.delete(currentRecipe.id);
    navigate("/");
  }

  function handleDownloadBom() {
    if (!audit) {
      return;
    }
    const bom = generateSeasoningBOM({
      recipe: currentRecipe,
      components: recipeComponents,
      generatedAt: new Date(),
      recipeAlerts: audit.recipeAlerts,
    });
    downloadJson(`${currentRecipe.slug}-seasoningbom.json`, bom);
    setMessage("SeasoningBOM JSON downloaded.");
  }

  return (
    <>
      {message ? <div className="flash">{message}</div> : null}
      <div className="repo-header">
        <div className="repo-header-main">
          <div>
            <div className="repo-path">
              <RepoIcon />
              <AppLink to={`/users/${currentRecipe.ownerHandle}`}>
                {currentRecipe.ownerHandle}
              </AppLink>
              <span>/</span>
              <span>{currentRecipe.slug}</span>
            </div>
            <p className="muted">{currentRecipe.description}</p>
            <div className="label-row">
              <Label>{currentRecipe.visibility}</Label>
              <Label variant="accent">v{currentRecipe.version}</Label>
              {currentRecipe.tags.map((tag) => (
                <Label key={tag}>{tag}</Label>
              ))}
            </div>
          </div>
          <div>
            <div className="meta-line muted">
              <span>{currentRecipe.servings} servings</span>
              <span>{fakeStars(currentRecipe, recipeComponents)} stars</span>
              <span>{fakeForks(currentRecipe)} forks</span>
              <span>
                {(audit?.recipeAlerts.length ?? 0) +
                  (audit?.inventoryAudit.summary.totalIssues ?? 0)}{" "}
                alerts
              </span>
            </div>
            <div className="action-row">
              <Button
                type="button"
                onClick={() => navigate(`/${currentRecipe.ownerHandle}/${currentRecipe.slug}/edit`)}
              >
                <PencilIcon /> Edit
              </Button>
              <Button type="button" onClick={handleDownloadBom}>
                <DownloadIcon /> Download SBOM
              </Button>
              <Button type="button" variant="danger" onClick={handleDelete}>
                <TrashIcon /> Delete
              </Button>
            </div>
          </div>
        </div>
        <div className="tabs" role="tablist" aria-label="Repository sections">
          <TabButton active={tab === "code"} onClick={() => setTab("code")} icon={<CodeIcon />}>
            Code
          </TabButton>
          <TabButton
            active={tab === "dependencies"}
            onClick={() => setTab("dependencies")}
            icon={<PackageIcon />}
          >
            Dependencies
          </TabButton>
          <TabButton
            active={tab === "security"}
            onClick={() => setTab("security")}
            icon={<ShieldIcon />}
          >
            Security
          </TabButton>
        </div>
      </div>

      <section className="section">
        {tab === "code" ? (
          <CodeTab
            readme={currentRecipe.readme}
            components={recipeComponents}
            shoppingList={shoppingList}
            issueCount={
              (audit?.recipeAlerts.length ?? 0) + (audit?.inventoryAudit.summary.totalIssues ?? 0)
            }
            onAudit={() => setTab("security")}
          />
        ) : null}
        {tab === "dependencies" ? (
          <DependenciesTab
            components={recipeComponents}
            inventoryItems={inventoryItems}
            now={now}
            settings={settings}
          />
        ) : null}
        {tab === "security" && audit ? <SecurityTab audit={audit} /> : null}
      </section>
    </>
  );
}

function CloudRecipeDetailPage({
  api,
  ownerHandle,
  slug,
}: {
  api: SeasoningBomApiClient;
  ownerHandle: string;
  slug: string;
}) {
  const cloudProfile = useCloudProfile();
  const [tab, setTab] = useState<Tab>("code");
  const [state, setState] = useState<CloudRepositoryState>({ status: "loading" });
  const [inventoryAuditState, setInventoryAuditState] = useState<CloudInventoryAuditState>({
    status: "hidden",
  });
  const [starState, setStarState] = useState<CloudStarState>({ status: "hidden" });
  const [starSaving, setStarSaving] = useState(false);
  const [forking, setForking] = useState(false);
  const [message, setMessage] = useState<{ danger: boolean; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    setMessage(null);

    Promise.allSettled([
      api.getRepository(ownerHandle, slug, controller.signal),
      api.getRepositoryDependencies(ownerHandle, slug, controller.signal),
      api.getRepositorySecurity(ownerHandle, slug, controller.signal),
    ]).then(([repositoryResult, dependenciesResult, securityResult]) => {
      if (controller.signal.aborted) {
        return;
      }
      if (repositoryResult.status === "rejected") {
        setState({
          status:
            repositoryResult.reason instanceof CloudApiError &&
            repositoryResult.reason.status === 404
              ? "not-found"
              : "error",
        });
        return;
      }

      setState({
        status: "ready",
        repository: repositoryResult.value,
        components:
          dependenciesResult.status === "fulfilled" ? dependenciesResult.value.components : null,
        security: securityResult.status === "fulfilled" ? securityResult.value : null,
      });
    });

    return () => controller.abort();
  }, [api, ownerHandle, slug]);

  useEffect(() => {
    if (cloudProfile.status !== "ready") {
      setStarState({ status: "hidden" });
      return;
    }

    const controller = new AbortController();
    setStarState({ status: "loading" });
    api.getRepositoryStar(ownerHandle, slug, controller.signal).then(
      ({ starred }) => {
        if (!controller.signal.aborted) {
          setStarState({ starred, status: "ready" });
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setStarState({ status: "error" });
        }
      },
    );
    return () => controller.abort();
  }, [api, cloudProfile.status, ownerHandle, slug]);

  useEffect(() => {
    if (cloudProfile.status !== "ready") {
      setInventoryAuditState({ status: "hidden" });
      return;
    }
    if (tab !== "security") {
      return;
    }

    const controller = new AbortController();
    setInventoryAuditState({ status: "loading" });
    api.runRepositoryAudit(ownerHandle, slug, controller.signal).then(
      ({ inventoryAudit }) => {
        if (!controller.signal.aborted) {
          setInventoryAuditState({ inventoryAudit, status: "ready" });
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setInventoryAuditState({ status: "error" });
        }
      },
    );
    return () => controller.abort();
  }, [api, cloudProfile.status, ownerHandle, slug, tab]);

  if (state.status === "loading") {
    return <EmptyState title="Loading repository">Fetching recipe content...</EmptyState>;
  }
  if (state.status === "not-found") {
    return <EmptyState title="Repository not found">{slug}</EmptyState>;
  }
  if (state.status === "error") {
    return (
      <EmptyState title="Repository unavailable">
        The repository could not be loaded. Please try again.
      </EmptyState>
    );
  }

  const { components, repository, security } = state;

  async function handleDownloadBom() {
    setMessage(null);
    try {
      const bom = await api.getRepositoryBom(ownerHandle, slug);
      downloadJson(`${repository.slug}-seasoningbom.json`, bom);
      setMessage({ danger: false, text: "SeasoningBOM JSON downloaded." });
    } catch {
      setMessage({ danger: true, text: "SeasoningBOM download failed. Please try again." });
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${repository.ownerHandle}/${repository.slug}?`)) {
      return;
    }

    setMessage(null);
    try {
      await api.deleteRepository(repository.ownerHandle, repository.slug);
      navigate("/");
    } catch {
      setMessage({ danger: true, text: "Repository deletion failed. Please try again." });
    }
  }

  async function handleStar() {
    const starred = starState.status === "ready" && starState.starred;
    setStarSaving(true);
    setMessage(null);
    try {
      if (starred) {
        await api.unstarRepository(repository.ownerHandle, repository.slug);
        setStarState({ starred: false, status: "ready" });
        setMessage({ danger: false, text: "Star removed." });
      } else {
        const nextState = await api.starRepository(repository.ownerHandle, repository.slug);
        setStarState({ starred: nextState.starred, status: "ready" });
        setMessage({ danger: false, text: "Repository starred." });
      }
    } catch {
      setMessage({ danger: true, text: "Star update failed. Please try again." });
    } finally {
      setStarSaving(false);
    }
  }

  async function handleFork() {
    setForking(true);
    setMessage(null);
    try {
      const fork = await api.forkRepository(repository.ownerHandle, repository.slug);
      navigate(`/${fork.ownerHandle}/${fork.slug}`);
    } catch (error) {
      setMessage({
        danger: true,
        text:
          error instanceof CloudApiError
            ? error.message
            : "Repository fork failed. Please try again.",
      });
    } finally {
      setForking(false);
    }
  }

  const isOwner =
    cloudProfile.status === "ready" && cloudProfile.profile?.username === repository.ownerHandle;

  return (
    <>
      {message ? (
        <div
          className={message.danger ? "flash flash-danger" : "flash"}
          role={message.danger ? "alert" : "status"}
        >
          {message.text}
        </div>
      ) : null}
      <div className="repo-header">
        <div className="repo-header-main">
          <div>
            <div className="repo-path">
              <RepoIcon />
              <AppLink to={`/users/${repository.ownerHandle}`}>{repository.ownerHandle}</AppLink>
              <span>/</span>
              <span>{repository.slug}</span>
            </div>
            <p className="muted">{repository.description ?? "No description provided."}</p>
            <div className="label-row">
              <Label>{repository.visibility}</Label>
              <Label variant="accent">v{repository.version}</Label>
              {repository.tags.map((tag) => (
                <Label key={tag}>{tag}</Label>
              ))}
            </div>
            {repository.sourceRepositoryId ? (
              <p className="muted">Forked from repository {repository.sourceRepositoryId}.</p>
            ) : null}
          </div>
          <div>
            <div className="meta-line muted">
              <span>{repository.servings} servings</span>
              <span>
                {components === null
                  ? "Dependencies unavailable"
                  : `${components.length} dependencies`}
              </span>
              <span>
                {security === null
                  ? "Security unavailable"
                  : `${security.summary.totalIssues} public alerts`}
              </span>
            </div>
            <div className="action-row">
              {cloudProfile.status === "ready" ? (
                <Button
                  type="button"
                  disabled={starSaving || starState.status === "loading"}
                  variant={
                    starState.status === "ready" && starState.starred ? "primary" : undefined
                  }
                  onClick={handleStar}
                >
                  <StarIcon />
                  {starSaving
                    ? "Saving..."
                    : starState.status === "ready" && starState.starred
                      ? "Unstar"
                      : "Star"}
                </Button>
              ) : null}
              {cloudProfile.status === "ready" && !isOwner ? (
                <Button type="button" disabled={forking} onClick={handleFork}>
                  <ForkIcon /> {forking ? "Forking..." : "Fork"}
                </Button>
              ) : null}
              {isOwner ? (
                <Button
                  type="button"
                  onClick={() => navigate(`/${repository.ownerHandle}/${repository.slug}/edit`)}
                >
                  <PencilIcon /> Edit
                </Button>
              ) : null}
              <Button type="button" onClick={handleDownloadBom}>
                <DownloadIcon /> Download SBOM
              </Button>
              {isOwner ? (
                <Button type="button" variant="danger" onClick={handleDelete}>
                  <TrashIcon /> Delete
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="tabs" role="tablist" aria-label="Repository sections">
          <TabButton active={tab === "code"} onClick={() => setTab("code")} icon={<CodeIcon />}>
            Code
          </TabButton>
          <TabButton
            active={tab === "dependencies"}
            onClick={() => setTab("dependencies")}
            icon={<PackageIcon />}
          >
            Dependencies
          </TabButton>
          <TabButton
            active={tab === "security"}
            onClick={() => setTab("security")}
            icon={<ShieldIcon />}
          >
            Security
          </TabButton>
        </div>
      </div>

      <section className="section">
        {tab === "code" ? (
          <CloudCodeTab
            readme={repository.readme}
            components={components}
            onAudit={() => setTab("security")}
          />
        ) : null}
        {tab === "dependencies" ? <CloudDependenciesTab components={components} /> : null}
        {tab === "security" ? (
          <CloudSecurityTab inventoryAuditState={inventoryAuditState} security={security} />
        ) : null}
      </section>
    </>
  );
}

function CloudCodeTab({
  readme,
  components,
  onAudit,
}: {
  readme?: string;
  components: CloudRecipeComponent[] | null;
  onAudit: () => void;
}) {
  return (
    <div className="surface readme">
      {renderReadme(readme)}
      <h2>Declared dependencies</h2>
      {components === null ? (
        <p className="muted">Dependencies could not be loaded.</p>
      ) : components.length === 0 ? (
        <p className="muted">No dependencies declared.</p>
      ) : (
        <ul>
          {components.map((component) => (
            <li key={component.id}>
              {component.ingredientName}@{formatQuantity(component.quantity, component.unit)}
            </li>
          ))}
        </ul>
      )}
      <div className="action-row">
        <Button type="button" onClick={onAudit}>
          <AlertIcon /> nom audit
        </Button>
      </div>
    </div>
  );
}

function CloudDependenciesTab({ components }: { components: CloudRecipeComponent[] | null }) {
  if (components === null) {
    return (
      <EmptyState title="Dependencies unavailable">
        The dependency graph could not be loaded. Please try again.
      </EmptyState>
    );
  }

  return (
    <div className="surface dependency-tree">
      {components.length === 0 ? <EmptyState title="No dependencies" /> : null}
      {components.map((component) => (
        <div className="dependency-item" key={component.id}>
          <div className="section-header">
            <div className="repo-title">
              <PackageIcon />
              {component.ingredientName}@{formatQuantity(component.quantity, component.unit)}
            </div>
            <DependencyLabel value={component.dependencyType} />
          </div>
          {component.allergens.length > 0 ? (
            <p className="muted">Allergens: {component.allergens.join(", ")}</p>
          ) : null}
          {component.alternatives.length > 0 ? (
            <p className="muted">Alternatives: {component.alternatives.join(", ")}</p>
          ) : null}
          {component.transitiveDependencies.length > 0 ? (
            <div className="dependency-children">
              {component.transitiveDependencies.map((dependency) => (
                <p key={dependency.id ?? `${component.id}-${dependency.name}`}>
                  <ChecklistIcon /> {dependency.name}{" "}
                  <DependencyLabel value={dependency.dependencyType} />
                  {dependency.allergens.length > 0
                    ? ` allergens: ${dependency.allergens.join(", ")}`
                    : ""}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CloudSecurityTab({
  inventoryAuditState,
  security,
}: {
  inventoryAuditState: CloudInventoryAuditState;
  security: CloudRepositorySecurity | null;
}) {
  return (
    <div className="surface readme">
      <h2>Security alerts</h2>
      {security === null ? (
        <EmptyState title="Security alerts unavailable">
          Public Recipe Alerts could not be loaded. Please try again.
        </EmptyState>
      ) : (
        <>
          <p className="muted">Public Recipe Alerts: {security.summary.totalIssues}.</p>
          <IssueGroups
            groups={groupIssuesBySeverity(security.recipeAlerts)}
            title="Recipe alerts"
            emptyTitle="No public recipe alerts"
          />
        </>
      )}
      {inventoryAuditState.status === "loading" ? (
        <section className="section">
          <div className="section-header">
            <h2>Your inventory audit</h2>
          </div>
          <p className="muted">Checking this recipe against your private inventory...</p>
        </section>
      ) : null}
      {inventoryAuditState.status === "error" ? (
        <section className="section">
          <div className="section-header">
            <h2>Your inventory audit</h2>
          </div>
          <p className="muted">Your private inventory audit could not be loaded.</p>
        </section>
      ) : null}
      {inventoryAuditState.status === "ready" ? (
        <IssueGroups
          groups={groupIssuesBySeverity(inventoryAuditState.inventoryAudit.issues)}
          title="Your inventory audit"
          emptyTitle="No private inventory audit issues"
        />
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="tab-button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}

function CodeTab({
  readme,
  components,
  shoppingList,
  issueCount,
  onAudit,
}: {
  readme?: string;
  components: ReturnType<typeof useLiveData>["components"];
  shoppingList: ReturnType<typeof generateShoppingList>;
  issueCount: number;
  onAudit: () => void;
}) {
  return (
    <div className="surface">
      <div className="readme">
        {renderReadme(readme)}
        <h2>Install dependencies</h2>
        <ul>
          {components.map((component) => (
            <li key={component.id}>
              {component.ingredientName}@{formatQuantity(component.quantity, component.unit)}
            </li>
          ))}
        </ul>
        <div className="action-row">
          <Button type="button" onClick={onAudit}>
            <AlertIcon /> nom audit
          </Button>
        </div>
      </div>

      <div className="terminal">
        <p>$ nom audit</p>
        <p>nom audit found {issueCount} issues.</p>
        <p>$ nom install</p>
        {shoppingList.length === 0 ? (
          <p>All required dependencies are installed.</p>
        ) : (
          <ul>
            {shoppingList.map((item) => (
              <li key={item.ingredientName}>
                {item.ingredientName}@{formatQuantity(item.missingQuantity, item.unit)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DependenciesTab({
  components,
  inventoryItems,
  now,
  settings,
}: {
  components: ReturnType<typeof useLiveData>["components"];
  inventoryItems: ReturnType<typeof useLiveData>["inventoryItems"];
  now: Date;
  settings: ReturnType<typeof useLiveData>["settings"];
}) {
  return (
    <div className="surface dependency-tree">
      {components.length === 0 ? <EmptyState title="No dependencies" /> : null}
      {components.map((component) => {
        const inventoryItem = inventoryItems.find(
          (item) =>
            item.name.trim().toLowerCase() === component.ingredientName.trim().toLowerCase(),
        );
        const lifecycleStatus = inventoryItem
          ? calculateLifecycleStatus({
              item: inventoryItem,
              now,
              deprecatedThresholdDays: settings.deprecatedThresholdDays,
            })
          : null;
        return (
          <div className="dependency-item" key={component.id}>
            <div className="section-header">
              <div className="repo-title">
                <PackageIcon />
                {component.ingredientName}@{formatQuantity(component.quantity, component.unit)}
              </div>
              <div className="label-row">
                <DependencyLabel value={component.dependencyType} />
                {lifecycleStatus ? (
                  <LifecycleLabel status={lifecycleStatus} />
                ) : (
                  <Label>Not installed</Label>
                )}
              </div>
            </div>
            {component.allergens.length > 0 ? (
              <p className="muted">Allergens: {component.allergens.join(", ")}</p>
            ) : null}
            {component.transitiveDependencies.length > 0 ? (
              <div className="dependency-children">
                {component.transitiveDependencies.map((dependency) => (
                  <p key={`${component.id}-${dependency.name}`}>
                    <ChecklistIcon /> {dependency.name}{" "}
                    <DependencyLabel value={dependency.dependencyType} />
                    {dependency.allergens.length > 0
                      ? ` allergens: ${dependency.allergens.join(", ")}`
                      : ""}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SecurityTab({ audit }: { audit: NonNullable<ReturnType<typeof runNomAudit>> }) {
  const recipeAlertGroups = groupIssuesBySeverity(audit.recipeAlerts);
  const inventoryGroups = groupIssuesBySeverity(audit.inventoryAudit.issues);
  const recipeAlertSummary = summarizeIssues(audit.recipeAlerts);
  return (
    <div className="surface readme">
      <h2>Security alerts</h2>
      <p className="muted">
        Recipe alerts: {recipeAlertSummary.totalIssues}. Your inventory audit:{" "}
        {audit.inventoryAudit.summary.totalIssues}.
      </p>
      {audit.recipeAlerts.length === 0 && audit.inventoryAudit.issues.length === 0 ? (
        <EmptyState title="No active audit issues" />
      ) : null}
      <IssueGroups
        groups={recipeAlertGroups}
        title="Recipe alerts"
        emptyTitle="No public recipe alerts"
      />
      <IssueGroups
        groups={inventoryGroups}
        title="Your inventory audit"
        emptyTitle="No private inventory audit issues"
      />
    </div>
  );
}

function IssueGroups({
  groups,
  title,
  emptyTitle,
}: {
  groups: Record<"critical" | "high" | "medium" | "low", AuditIssue[]>;
  title: string;
  emptyTitle: string;
}) {
  const total = Object.values(groups).reduce((sum, issues) => sum + issues.length, 0);
  return (
    <section className="section">
      <div className="section-header">
        <h2>{title}</h2>
      </div>
      {total === 0 ? <EmptyState title={emptyTitle} /> : null}
      {(["critical", "high", "medium", "low"] as const).map((severity) =>
        groups[severity].length > 0 ? (
          <section className="section" key={severity}>
            <div className="section-header">
              <h2>{severity}</h2>
            </div>
            <div className="alert-list">
              {groups[severity].map((issue) => (
                <div className="alert-row" key={issue.id}>
                  <SeverityLabel severity={issue.severity} />
                  <div>
                    <strong>{issue.message}</strong>
                    {issue.recommendation ? <p className="muted">{issue.recommendation}</p> : null}
                  </div>
                  {issue.componentName ? (
                    <span className="muted">{issue.componentName}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null,
      )}
    </section>
  );
}

function renderReadme(readme?: string) {
  if (!readme) {
    return <p className="muted">No README committed yet.</p>;
  }

  return readme.split("\n").map((line, index) => {
    const key = `${index}-${line}`;
    if (line.startsWith("# ")) {
      return <h1 key={key}>{line.slice(2)}</h1>;
    }
    if (line.startsWith("## ")) {
      return <h2 key={key}>{line.slice(3)}</h2>;
    }
    if (/^\d+\.\s/.test(line)) {
      return <p key={key}>{line}</p>;
    }
    if (!line.trim()) {
      return null;
    }
    return <p key={key}>{line}</p>;
  });
}
