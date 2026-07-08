import type { D1Database } from "../../workers/api/types";
import type { CloudContributionEvent } from "./D1ContributionEvent";
import type { ContributionVisibility } from "./D1UserProfileRepository";

export type CloudCookingLog = {
  id: string;
  userId: string;
  authorHandle: string;
  authorDisplayName?: string;
  repositoryId: string;
  recipeVersion: string;
  result: string;
  notes?: string;
  cookedAt: string;
  createdAt: string;
};

export type CreateCookingLogWithContributionInput = {
  cookingLogId: string;
  contributionEventId: string;
  userId: string;
  authorHandle: string;
  authorDisplayName?: string;
  repositoryId: string;
  repositoryOwnerHandle: string;
  repositorySlug: string;
  repositoryName: string;
  recipeVersion: string;
  result: string;
  notes?: string;
  cookedAt: string;
  occurredOn: string;
  now: string;
  contributionVisibility: ContributionVisibility;
};

type CookingLogRow = {
  id: string;
  user_id: string;
  author_handle: string;
  author_display_name: string | null;
  repository_id: string;
  recipe_version: string;
  result: string;
  notes: string | null;
  cooked_at: string;
  created_at: string;
};

export type CookingLogRepository = {
  createWithContribution(input: CreateCookingLogWithContributionInput): Promise<{
    contributionEvent: CloudContributionEvent;
    cookingLog: CloudCookingLog;
  }>;
  listVisibleForRepository(input: {
    repositoryId: string;
    viewerUserId?: string;
  }): Promise<CloudCookingLog[]>;
};

const cookingLogSelect = `SELECT
  cooking_logs.id,
  cooking_logs.user_id,
  user_profiles.username AS author_handle,
  user_profiles.display_name AS author_display_name,
  cooking_logs.repository_id,
  cooking_logs.recipe_version,
  cooking_logs.result,
  cooking_logs.notes,
  cooking_logs.cooked_at,
  cooking_logs.created_at
FROM cooking_logs
INNER JOIN user_profiles ON user_profiles.id = cooking_logs.user_id`;

export class D1CookingLogRepository implements CookingLogRepository {
  constructor(private readonly db: D1Database) {}

  async listVisibleForRepository(input: {
    repositoryId: string;
    viewerUserId?: string;
  }): Promise<CloudCookingLog[]> {
    const result = await this.db
      .prepare(`${cookingLogSelect}
         WHERE cooking_logs.repository_id = ?
           AND (
             user_profiles.contribution_visibility = ?
             OR cooking_logs.user_id = ?
           )
         ORDER BY cooking_logs.cooked_at DESC, cooking_logs.created_at DESC
         LIMIT 100`)
      .bind(input.repositoryId, "public", input.viewerUserId ?? "")
      .all<CookingLogRow>();

    return (result.results ?? []).map(mapCookingLogRow);
  }

  async createWithContribution(input: CreateCookingLogWithContributionInput): Promise<{
    contributionEvent: CloudContributionEvent;
    cookingLog: CloudCookingLog;
  }> {
    const metadata = {
      cookingLogId: input.cookingLogId,
      recipeVersion: input.recipeVersion,
      repositoryName: input.repositoryName,
      repositoryOwnerHandle: input.repositoryOwnerHandle,
      repositorySlug: input.repositorySlug,
      result: input.result,
    };

    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO cooking_logs (
             id, user_id, repository_id, recipe_version, result, notes, cooked_at, created_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.cookingLogId,
          input.userId,
          input.repositoryId,
          input.recipeVersion,
          input.result,
          input.notes ?? null,
          input.cookedAt,
          input.now,
        ),
      this.db
        .prepare(
          `INSERT INTO contribution_events (
             id, user_id, event_type, repository_id, occurred_on, occurred_at,
             contribution_count, visibility, metadata_json
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.contributionEventId,
          input.userId,
          "cooking_logged",
          input.repositoryId,
          input.occurredOn,
          input.cookedAt,
          1,
          input.contributionVisibility,
          JSON.stringify(metadata),
        ),
    ]);

    return {
      contributionEvent: {
        contributionCount: 1,
        eventType: "cooking_logged",
        id: input.contributionEventId,
        metadata,
        occurredAt: input.cookedAt,
        occurredOn: input.occurredOn,
        repositoryId: input.repositoryId,
        userId: input.userId,
        visibility: input.contributionVisibility,
      },
      cookingLog: {
        authorDisplayName: input.authorDisplayName,
        authorHandle: input.authorHandle,
        cookedAt: input.cookedAt,
        createdAt: input.now,
        id: input.cookingLogId,
        notes: input.notes,
        recipeVersion: input.recipeVersion,
        repositoryId: input.repositoryId,
        result: input.result,
        userId: input.userId,
      },
    };
  }
}

function mapCookingLogRow(row: CookingLogRow): CloudCookingLog {
  return {
    authorDisplayName: row.author_display_name ?? undefined,
    authorHandle: row.author_handle,
    cookedAt: row.cooked_at,
    createdAt: row.created_at,
    id: row.id,
    notes: row.notes ?? undefined,
    recipeVersion: row.recipe_version,
    repositoryId: row.repository_id,
    result: row.result,
    userId: row.user_id,
  };
}
