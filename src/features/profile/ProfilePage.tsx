import { Label } from "@primer/react";
import { useEffect, useMemo, useState } from "react";
import { useCloudApi } from "../../app/providers/CloudApiProvider";
import {
  CloudApiError,
  type CloudContributionDay,
  type CloudContributionDayDetail,
  type CloudContributionLevel,
  type CloudContributionList,
  type CloudRepository,
  type CloudUserProfile,
  type SeasoningBomApiClient,
} from "../../repositories/cloud-api/SeasoningBomApiClient";
import { EmptyState } from "../../ui/components/EmptyState";
import { AppLink } from "../../ui/components/Link";
import { RepoIcon } from "../../ui/components/TemporaryIcons";
import { useLiveData } from "../useLiveData";

type CloudProfileState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | {
      status: "ready";
      profile: CloudUserProfile;
      contributions: CloudContributionList | null;
      contributionState: "ready" | "private" | "error";
      repositories: CloudRepository[];
      repositoriesUnavailable: boolean;
    };

type ContributionDayState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; detail: CloudContributionDayDetail };

const contributionLevelLabels: Record<CloudContributionLevel, string> = {
  0: "No cooking",
  1: "Light simmer",
  2: "Medium heat",
  3: "High heat",
  4: "Burning kitchen",
};

const contributionEventLabels: Record<
  CloudContributionDayDetail["events"][number]["eventType"],
  string
> = {
  cooking_logged: "Cooking logged",
  eol_rescued: "EOL ingredients rescued",
  recipe_created: "Recipe repository created",
  recipe_updated: "Recipe updated",
  repository_forked: "Repository forked",
};
const leadingCalendarPlaceholders = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
] as const;

export function ProfilePage({ username }: { username: string }) {
  const cloudApi = useCloudApi();

  return cloudApi ? (
    <CloudProfilePage apiClient={cloudApi} username={username} />
  ) : (
    <LocalProfilePage username={username} />
  );
}

function CloudProfilePage({
  apiClient,
  username,
}: {
  apiClient: SeasoningBomApiClient;
  username: string;
}) {
  const [state, setState] = useState<CloudProfileState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    const loadProfile = async () => {
      const [profileResult, contributionResult, repositoryResult] = await Promise.allSettled([
        apiClient.getPublicProfile(username, controller.signal),
        apiClient.getUserContributions(username, controller.signal),
        apiClient.listPublicRepositories(controller.signal),
      ]);

      if (controller.signal.aborted) {
        return;
      }

      if (profileResult.status === "rejected") {
        setState({ status: isNotFound(profileResult.reason) ? "not-found" : "error" });
        return;
      }

      const contributionState =
        contributionResult.status === "fulfilled"
          ? "ready"
          : isNotFound(contributionResult.reason)
            ? "private"
            : "error";
      const repositories =
        repositoryResult.status === "fulfilled"
          ? repositoryResult.value.filter((repository) => repository.ownerHandle === username)
          : [];

      setState({
        contributionState,
        contributions: contributionResult.status === "fulfilled" ? contributionResult.value : null,
        profile: profileResult.value,
        repositories,
        repositoriesUnavailable: repositoryResult.status === "rejected",
        status: "ready",
      });
    };

    void loadProfile();
    return () => controller.abort();
  }, [apiClient, username]);

  if (state.status === "loading") {
    return <EmptyState title="Loading profile">Fetching cooking activity...</EmptyState>;
  }
  if (state.status === "not-found") {
    return <EmptyState title="Profile not found">{username}</EmptyState>;
  }
  if (state.status === "error") {
    return (
      <EmptyState title="Profile unavailable">
        The cloud profile could not be loaded. Please try again.
      </EmptyState>
    );
  }

  const displayName = state.profile.displayName ?? state.profile.username;

  return (
    <>
      <div className="profile-heading">
        {state.profile.avatarUrl ? (
          <img className="profile-avatar" src={state.profile.avatarUrl} alt="" />
        ) : (
          <span className="profile-avatar profile-avatar-fallback" aria-hidden="true">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div>
          <h1>{displayName}</h1>
          {state.profile.displayName ? (
            <p className="profile-handle">@{state.profile.username}</p>
          ) : null}
          <p>Repository-style cooking enthusiast</p>
        </div>
      </div>

      <CloudContributionSection
        apiClient={apiClient}
        contributionState={state.contributionState}
        contributions={state.contributions}
        repositoryCount={state.repositories.length}
        username={state.profile.username}
      />

      <RepositorySection
        repositories={state.repositories}
        unavailable={state.repositoriesUnavailable}
      />
    </>
  );
}

function CloudContributionSection({
  apiClient,
  contributionState,
  contributions,
  repositoryCount,
  username,
}: {
  apiClient: SeasoningBomApiClient;
  contributionState: "ready" | "private" | "error";
  contributions: CloudContributionList | null;
  repositoryCount: number;
  username: string;
}) {
  if (contributionState === "private") {
    return (
      <section className="section" aria-labelledby="contribution-heading">
        <div className="section-header">
          <h2 id="contribution-heading">Cooking contributions</h2>
        </div>
        <EmptyState title="Contribution activity is private">
          This profile does not share its cooking graph.
        </EmptyState>
      </section>
    );
  }

  if (contributionState === "error" || !contributions) {
    return (
      <section className="section" aria-labelledby="contribution-heading">
        <div className="section-header">
          <h2 id="contribution-heading">Cooking contributions</h2>
        </div>
        <EmptyState title="Contributions unavailable">
          Cooking activity could not be loaded.
        </EmptyState>
      </section>
    );
  }

  const longestStreak = calculateLongestStreak(contributions.days);

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <strong>{contributions.totalContributions}</strong>
          <span className="muted">contributions in the last year</span>
        </div>
        <div className="stat">
          <strong>{longestStreak}</strong>
          <span className="muted">longest cooking streak</span>
        </div>
        <div className="stat">
          <strong>{repositoryCount}</strong>
          <span className="muted">public repositories</span>
        </div>
      </div>

      <ContributionGraph apiClient={apiClient} data={contributions} username={username} />
    </>
  );
}

function ContributionGraph({
  apiClient,
  data,
  username,
}: {
  apiClient: SeasoningBomApiClient;
  data: CloudContributionList;
  username: string;
}) {
  const [selectedDay, setSelectedDay] = useState<CloudContributionDay | null>(null);
  const [dayState, setDayState] = useState<ContributionDayState>({ status: "idle" });
  const leadingDays = useMemo(() => getLeadingCalendarDays(data.days), [data.days]);

  useEffect(() => {
    if (!selectedDay || !data.detailsVisible) {
      setDayState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setDayState({ status: "loading" });
    apiClient
      .getUserContributionDay(username, selectedDay.date, controller.signal)
      .then((detail) => setDayState({ detail, status: "ready" }))
      .catch(() => {
        if (!controller.signal.aborted) {
          setDayState({ status: "error" });
        }
      });

    return () => controller.abort();
  }, [apiClient, data.detailsVisible, selectedDay, username]);

  return (
    <section className="section contribution-section" aria-labelledby="contribution-heading">
      <div className="section-header contribution-header">
        <div>
          <h2 id="contribution-heading">Cooking contributions</h2>
          <span className="muted">
            {data.from} to {data.to}
          </span>
        </div>
        <div className="contribution-legend">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span
              className={`contribution-swatch contribution-level-${level}`}
              key={level}
              title={contributionLevelLabels[level as CloudContributionLevel]}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="contribution-graph-scroll">
        <fieldset className="contribution-grid">
          <legend className="visually-hidden">Cooking contribution calendar</legend>
          {leadingCalendarPlaceholders.slice(0, leadingDays).map((weekday) => (
            <span className="contribution-placeholder" key={weekday} />
          ))}
          {data.days.map((day) => {
            const label = `${formatContributionCount(day.contributionCount)} on ${day.date}, ${contributionLevelLabels[day.level]}`;
            return (
              <button
                aria-label={label}
                aria-pressed={selectedDay?.date === day.date}
                className={`contribution-day contribution-level-${day.level}`}
                key={day.date}
                onClick={() => setSelectedDay(day)}
                title={label}
                type="button"
              />
            );
          })}
        </fieldset>
      </div>

      {selectedDay ? (
        <ContributionDayPanel
          day={selectedDay}
          detailsVisible={data.detailsVisible}
          state={dayState}
        />
      ) : null}
    </section>
  );
}

function ContributionDayPanel({
  day,
  detailsVisible,
  state,
}: {
  day: CloudContributionDay;
  detailsVisible: boolean;
  state: ContributionDayState;
}) {
  if (!detailsVisible) {
    return (
      <div className="contribution-detail" aria-live="polite">
        <strong>{day.date}</strong>
        <span>{formatContributionCount(day.contributionCount)}</span>
        <span className="muted">Daily activity details are private.</span>
      </div>
    );
  }

  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className="contribution-detail" aria-live="polite">
        <strong>{day.date}</strong>
        <span className="muted">Loading activity...</span>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="contribution-detail" aria-live="polite">
        <strong>{day.date}</strong>
        <span className="danger-text">Activity details could not be loaded.</span>
      </div>
    );
  }

  return (
    <div className="contribution-detail" aria-live="polite">
      <div className="contribution-detail-heading">
        <strong>{state.detail.date}</strong>
        <span>{formatContributionCount(state.detail.contributionCount)}</span>
      </div>
      {state.detail.events.length === 0 ? (
        <span className="muted">No visible cooking events.</span>
      ) : (
        <ul className="contribution-events">
          {state.detail.events.map((event) => (
            <li key={event.id}>
              <span>{contributionEventLabels[event.eventType]}</span>
              <strong>+{event.contributionCount}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RepositorySection({
  repositories,
  unavailable,
}: {
  repositories: CloudRepository[];
  unavailable: boolean;
}) {
  return (
    <section className="section">
      <div className="section-header">
        <h2>Pinned repositories</h2>
      </div>
      {unavailable ? (
        <EmptyState title="Repositories unavailable">
          Public repositories could not be loaded.
        </EmptyState>
      ) : repositories.length === 0 ? (
        <EmptyState title="No public repositories">
          This cook has not published a recipe repository yet.
        </EmptyState>
      ) : (
        <div className="grid">
          {repositories.map((repository) => (
            <RepositoryCard key={repository.id} repository={repository} />
          ))}
        </div>
      )}
    </section>
  );
}

function RepositoryCard({ repository }: { repository: CloudRepository }) {
  return (
    <AppLink
      className="repo-card repo-card-link"
      to={`/${repository.ownerHandle}/${repository.slug}`}
    >
      <div className="repo-title">
        <RepoIcon />
        <span className="repo-name">
          {repository.ownerHandle}/{repository.slug}
        </span>
      </div>
      <p className="muted">{repository.description}</p>
      <div className="label-row">
        <Label>{repository.visibility}</Label>
        <Label variant="accent">v{repository.version}</Label>
      </div>
    </AppLink>
  );
}

function LocalProfilePage({ username }: { username: string }) {
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
            <RepositoryCard key={recipe.id} repository={recipe} />
          ))}
        </div>
      </section>
    </>
  );
}

function calculateLongestStreak(days: CloudContributionDay[]): number {
  let current = 0;
  let longest = 0;

  for (const day of days) {
    if (day.contributionCount > 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }

  return longest;
}

function getLeadingCalendarDays(days: CloudContributionDay[]): number {
  const firstDate = days[0]?.date;
  return firstDate ? new Date(`${firstDate}T00:00:00.000Z`).getUTCDay() : 0;
}

function isNotFound(error: unknown): boolean {
  return error instanceof CloudApiError && error.status === 404;
}

function formatContributionCount(count: number): string {
  return `${count} ${count === 1 ? "contribution" : "contributions"}`;
}
