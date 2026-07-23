import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(join(process.cwd(), "migrations/0001_cloud_mvp.sql"), "utf8");
const seedSql = readFileSync(join(process.cwd(), "examples/seed-public-repositories.sql"), "utf8");

describe("public example repository seed", () => {
  it("is idempotent and includes complete public dependency manifests", () => {
    const db = new DatabaseSync(":memory:");

    try {
      db.exec(migrationSql);
      db.exec(seedSql);
      db.exec(seedSql);

      const repositories = db
        .prepare(
          "SELECT slug, visibility FROM recipe_repositories WHERE owner_user_id = ? ORDER BY slug",
        )
        .all("profile_public_examples");
      const components = db
        .prepare("SELECT COUNT(*) AS count FROM recipe_components WHERE repository_id IN (?, ?)")
        .get("repo_example_curry", "repo_example_soup") as { count: number };
      const dependencies = db
        .prepare("SELECT dependency_name FROM ingredient_dependencies ORDER BY dependency_name")
        .all() as Array<{ dependency_name: string }>;

      expect(repositories).toEqual([
        { slug: "curry-rice", visibility: "public" },
        { slug: "eol-rescue-soup", visibility: "public" },
      ]);
      expect(components.count).toBe(6);
      expect(dependencies.map((row) => row.dependency_name)).toEqual([
        "celery",
        "milk",
        "soy",
        "wheat",
      ]);
    } finally {
      db.close();
    }
  });
});
