import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "../repositories/memory/MemoryRepositories";
import { ensureSeedData } from "./seedData";

describe("ensureSeedData", () => {
  it("seeds default app data once", async () => {
    const repositories = createMemoryRepositories();

    await ensureSeedData(repositories);
    await expect(repositories.recipes.findAll()).resolves.toHaveLength(2);
    await expect(repositories.components.findAll()).resolves.toHaveLength(7);
    await expect(repositories.inventory.findAll()).resolves.toHaveLength(6);

    await ensureSeedData(repositories);
    await expect(repositories.recipes.findAll()).resolves.toHaveLength(2);
  });
});
