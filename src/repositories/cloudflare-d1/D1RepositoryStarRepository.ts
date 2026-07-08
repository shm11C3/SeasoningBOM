import type { D1Database } from "../../workers/api/types";

export type RepositoryStarInput = {
  userId: string;
  repositoryId: string;
  now: string;
};

export type RepositoryStarKey = {
  userId: string;
  repositoryId: string;
};

export type RepositoryStarRepository = {
  star(input: RepositoryStarInput): Promise<void>;
  unstar(key: RepositoryStarKey): Promise<void>;
  isStarred(key: RepositoryStarKey): Promise<boolean>;
};

export class D1RepositoryStarRepository implements RepositoryStarRepository {
  constructor(private readonly db: D1Database) {}

  async star(input: RepositoryStarInput): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO repository_stars (user_id, repository_id, created_at)
         VALUES (?, ?, ?)`,
      )
      .bind(input.userId, input.repositoryId, input.now)
      .run();
  }

  async unstar(key: RepositoryStarKey): Promise<void> {
    await this.db
      .prepare("DELETE FROM repository_stars WHERE user_id = ? AND repository_id = ?")
      .bind(key.userId, key.repositoryId)
      .run();
  }

  async isStarred(key: RepositoryStarKey): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT 1 AS starred FROM repository_stars WHERE user_id = ? AND repository_id = ?")
      .bind(key.userId, key.repositoryId)
      .first<{ starred: number }>();

    return row !== null;
  }
}
