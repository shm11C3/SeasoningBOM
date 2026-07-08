import type { D1Database } from "../../workers/api/types";
import type { ContributionVisibility } from "./D1UserProfileRepository";

export type ContributionEventType =
  | "recipe_created"
  | "recipe_updated"
  | "cooking_logged"
  | "eol_rescued"
  | "repository_forked";

export type CloudContributionEvent = {
  id: string;
  userId: string;
  eventType: ContributionEventType;
  repositoryId?: string;
  occurredOn: string;
  occurredAt: string;
  contributionCount: number;
  visibility: ContributionVisibility;
  metadata: Record<string, unknown>;
};

export type ContributionDateCount = {
  occurredOn: string;
  contributionCount: number;
};

type ContributionCountRow = {
  occurred_on: string;
  contribution_count: number;
};

type ContributionEventRow = {
  id: string;
  user_id: string;
  event_type: ContributionEventType;
  repository_id: string | null;
  occurred_on: string;
  occurred_at: string;
  contribution_count: number;
  visibility: ContributionVisibility;
  metadata_json: string;
};

export type ContributionRepository = {
  listCountsByDate(input: {
    userId: string;
    from: string;
    to: string;
  }): Promise<ContributionDateCount[]>;
  listEventsForDate(input: {
    userId: string;
    occurredOn: string;
    publicOnly: boolean;
  }): Promise<CloudContributionEvent[]>;
};

const contributionEventSelect = `SELECT
  id,
  user_id,
  event_type,
  repository_id,
  occurred_on,
  occurred_at,
  contribution_count,
  visibility,
  metadata_json
FROM contribution_events`;

export class D1ContributionRepository implements ContributionRepository {
  constructor(private readonly db: D1Database) {}

  async listCountsByDate(input: {
    userId: string;
    from: string;
    to: string;
  }): Promise<ContributionDateCount[]> {
    const result = await this.db
      .prepare(`SELECT
          occurred_on,
          SUM(contribution_count) AS contribution_count
        FROM contribution_events
        WHERE user_id = ?
          AND occurred_on >= ?
          AND occurred_on <= ?
        GROUP BY occurred_on
        ORDER BY occurred_on ASC`)
      .bind(input.userId, input.from, input.to)
      .all<ContributionCountRow>();

    return (result.results ?? []).map((row) => ({
      contributionCount: row.contribution_count,
      occurredOn: row.occurred_on,
    }));
  }

  async listEventsForDate(input: {
    userId: string;
    occurredOn: string;
    publicOnly: boolean;
  }): Promise<CloudContributionEvent[]> {
    const publicFilter = input.publicOnly ? "AND visibility = ?" : "";
    const bindings = input.publicOnly
      ? [input.userId, input.occurredOn, "public"]
      : [input.userId, input.occurredOn];
    const result = await this.db
      .prepare(`${contributionEventSelect}
        WHERE user_id = ?
          AND occurred_on = ?
          ${publicFilter}
        ORDER BY occurred_at DESC, id ASC`)
      .bind(...bindings)
      .all<ContributionEventRow>();

    return (result.results ?? []).map(mapContributionEventRow);
  }
}

function mapContributionEventRow(row: ContributionEventRow): CloudContributionEvent {
  return {
    contributionCount: row.contribution_count,
    eventType: row.event_type,
    id: row.id,
    metadata: parseMetadata(row.metadata_json),
    occurredAt: row.occurred_at,
    occurredOn: row.occurred_on,
    repositoryId: row.repository_id ?? undefined,
    userId: row.user_id,
    visibility: row.visibility,
  };
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
