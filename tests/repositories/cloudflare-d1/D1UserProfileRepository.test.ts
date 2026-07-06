import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D1UserProfileRepository } from "../../../src/repositories/cloudflare-d1/D1UserProfileRepository";
import { createSqliteD1 } from "./sqliteD1";

const migrationSql = readFileSync(join(process.cwd(), "migrations/0001_cloud_mvp.sql"), "utf8");

describe("D1UserProfileRepository", () => {
  let sqlite: DatabaseSync;
  let repository: D1UserProfileRepository;

  beforeEach(() => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(migrationSql);
    repository = new D1UserProfileRepository(createSqliteD1(sqlite));
  });

  afterEach(() => {
    sqlite.close();
  });

  it("creates and finds user profiles by Clerk subject and username", async () => {
    const created = await repository.create({
      authProvider: "clerk",
      authSubject: "user_test",
      avatarUrl: "https://example.test/avatar.png",
      displayName: "Test User",
      id: "profile_test",
      now: "2026-07-06T00:00:00.000Z",
      username: "test-user",
    });

    await expect(repository.findByAuthSubject("clerk", "user_test")).resolves.toEqual(created);
    await expect(repository.findByUsername("test-user")).resolves.toEqual(created);
    await expect(repository.findByUsername("missing")).resolves.toBeNull();
  });

  it("uses summary_only contribution visibility by default", async () => {
    const created = await repository.create({
      authProvider: "clerk",
      authSubject: "user_test",
      id: "profile_test",
      now: "2026-07-06T00:00:00.000Z",
      username: "test-user",
    });

    expect(created).toMatchObject({
      contributionVisibility: "summary_only",
    });
    await expect(repository.findByAuthSubject("clerk", "user_test")).resolves.toEqual(created);
  });

  it("preserves explicit contribution visibility", async () => {
    await expect(
      repository.create({
        authProvider: "clerk",
        authSubject: "user_test",
        contributionVisibility: "private",
        id: "profile_test",
        now: "2026-07-06T00:00:00.000Z",
        username: "test-user",
      }),
    ).resolves.toMatchObject({
      contributionVisibility: "private",
    });
  });

  it("returns null when a Clerk subject is missing", async () => {
    await expect(repository.findByAuthSubject("clerk", "missing")).resolves.toBeNull();
  });
});
