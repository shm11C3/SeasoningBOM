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
