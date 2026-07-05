import type { D1Database } from "../../workers/api/types";

export type ContributionVisibility = "private" | "public" | "summary_only";

export type UserProfile = {
  id: string;
  authProvider: "clerk";
  authSubject: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  contributionVisibility: ContributionVisibility;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserProfileInput = {
  id: string;
  authProvider: "clerk";
  authSubject: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  contributionVisibility?: ContributionVisibility;
  now: string;
};

type UserProfileRow = {
  id: string;
  auth_provider: "clerk";
  auth_subject: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  contribution_visibility: ContributionVisibility;
  created_at: string;
  updated_at: string;
};

export type UserProfileRepository = {
  create(input: CreateUserProfileInput): Promise<UserProfile>;
  findByAuthSubject(authProvider: "clerk", authSubject: string): Promise<UserProfile | null>;
  findByUsername(username: string): Promise<UserProfile | null>;
};

export class D1UserProfileRepository implements UserProfileRepository {
  constructor(private readonly db: D1Database) {}

  async findByAuthSubject(authProvider: "clerk", authSubject: string): Promise<UserProfile | null> {
    const row = await this.db
      .prepare(
        `SELECT id, auth_provider, auth_subject, username, display_name, avatar_url,
                contribution_visibility, created_at, updated_at
         FROM user_profiles
         WHERE auth_provider = ? AND auth_subject = ?`,
      )
      .bind(authProvider, authSubject)
      .first<UserProfileRow>();

    return row ? mapUserProfileRow(row) : null;
  }

  async findByUsername(username: string): Promise<UserProfile | null> {
    const row = await this.db
      .prepare(
        `SELECT id, auth_provider, auth_subject, username, display_name, avatar_url,
                contribution_visibility, created_at, updated_at
         FROM user_profiles
         WHERE username = ?`,
      )
      .bind(username)
      .first<UserProfileRow>();

    return row ? mapUserProfileRow(row) : null;
  }

  async create(input: CreateUserProfileInput): Promise<UserProfile> {
    const contributionVisibility = input.contributionVisibility ?? "summary_only";

    await this.db
      .prepare(
        `INSERT INTO user_profiles (
           id, auth_provider, auth_subject, username, display_name, avatar_url,
           contribution_visibility, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.authProvider,
        input.authSubject,
        input.username,
        input.displayName ?? null,
        input.avatarUrl ?? null,
        contributionVisibility,
        input.now,
        input.now,
      )
      .run();

    return {
      id: input.id,
      authProvider: input.authProvider,
      authSubject: input.authSubject,
      username: input.username,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      contributionVisibility,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }
}

export function mapUserProfileRow(row: UserProfileRow): UserProfile {
  return {
    id: row.id,
    authProvider: row.auth_provider,
    authSubject: row.auth_subject,
    username: row.username,
    displayName: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    contributionVisibility: row.contribution_visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
