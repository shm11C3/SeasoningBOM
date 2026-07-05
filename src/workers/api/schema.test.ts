import { describe, expect, it } from "vitest";
import migrationSql from "../../../migrations/0001_cloud_mvp.sql?raw";
import { cloudMvpRequiredIndexNames, cloudMvpTableNames } from "./schema";

describe("Cloud MVP D1 migration", () => {
  it("creates the required tables and indexes", () => {
    for (const tableName of cloudMvpTableNames) {
      expect(migrationSql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}\\b`, "i"));
    }

    for (const indexName of cloudMvpRequiredIndexNames) {
      expect(migrationSql).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName}\\b`, "i"));
    }
  });

  it("preserves key ownership, auth, and visibility constraints", () => {
    expect(migrationSql).toContain("UNIQUE(auth_provider, auth_subject)");
    expect(migrationSql).toContain("UNIQUE(username)");
    expect(migrationSql).toContain("UNIQUE(owner_user_id, slug)");
    expect(migrationSql).toContain("FOREIGN KEY(owner_user_id) REFERENCES user_profiles(id)");
    expect(migrationSql).toContain("FOREIGN KEY(user_id) REFERENCES user_profiles(id)");
    expect(migrationSql).toContain("contribution_visibility TEXT NOT NULL DEFAULT 'summary_only'");
  });
});
