import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const backupFixture = {
  format: "SeasoningBOMAppBackup",
  version: "0.1.0",
  exportedAt: "2026-07-01T00:00:00.000Z",
  repositories: [
    {
      id: "recipe-backup-soup",
      name: "Backup Soup",
      slug: "backup-soup",
      description: "Imported through Backup JSON.",
      version: "1.0.0",
      servings: 2,
      tags: ["e2e", "backup"],
      license: "MIT-Meal",
      maintainer: "e2e",
      readme: "# Backup Soup\n\nImported from a SeasoningBOMAppBackup fixture.",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    },
  ],
  components: [
    {
      id: "component-backup-soup-rice",
      recipeId: "recipe-backup-soup",
      ingredientName: "rice",
      quantity: 1,
      unit: "go",
      dependencyType: "required",
      required: true,
      allergens: [],
      alternatives: [],
      transitiveDependencies: [],
    },
  ],
  inventoryItems: [
    {
      id: "inventory-backup-rice",
      name: "rice",
      category: "grain",
      quantity: 1,
      unit: "go",
      bestBeforeDate: "2026-08-01",
      hazardous: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    },
  ],
  settings: {
    id: "default",
    deprecatedThresholdDays: 3,
    preferredTheme: "system",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
} as const;

test("inventory changes are stored in IndexedDB and survive reloads", async ({ page }) => {
  await page.goto("/inventory");

  await page.getByLabel("Name").fill("e2e pepper");
  await page.getByLabel("Category").selectOption("pantry");
  await page.getByLabel("Quantity").fill("4");
  await page.getByLabel("Unit").selectOption("pinch");
  await page.getByLabel("Best-before date").fill("2026-08-02");
  await page.getByRole("button", { name: "Add ingredient" }).click();

  const pepperRow = page.locator(".inventory-row").filter({ hasText: "e2e pepper" });
  await expect(pepperRow).toContainText("4pinch");
  await expect(pepperRow).toContainText("2026-08-02");

  await page.reload();
  await expect(pepperRow).toContainText("e2e pepper");
  await expect(pepperRow).toContainText("4pinch");

  await pepperRow.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Quantity").fill("5");
  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(pepperRow).toContainText("5pinch");

  await page.reload();
  await expect(pepperRow).toContainText("5pinch");

  await pepperRow.getByRole("button", { name: "Delete" }).click();
  await expect(pepperRow).toHaveCount(0);

  await page.reload();
  await expect(pepperRow).toHaveCount(0);
});

test("recipe repositories and dependencies are stored in IndexedDB and survive reloads", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New recipe" }).click();
  await expect(page).toHaveURL("/repositories/new/edit");

  await page.getByLabel("Name").fill("E2E Soup");
  await page.getByLabel("Slug").fill("e2e-soup");
  await page.getByLabel("Description").fill("Saved through the recipe editor.");
  await page.getByLabel("Tags").fill("e2e, warm");
  await page.getByLabel("Ingredient").fill("rice");
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Unit").selectOption("go");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL("/repositories/e2e-soup");
  await expect(page.locator(".repo-path")).toContainText("e2e-soup");
  await expect(page.locator("li").filter({ hasText: "rice@1go" }).first()).toBeVisible();

  await page.reload();
  await expect(page.locator(".repo-path")).toContainText("e2e-soup");
  await expect(page.locator("li").filter({ hasText: "rice@1go" }).first()).toBeVisible();

  await page.getByRole("link", { name: "me" }).click();
  const soupCard = page.getByRole("link", { name: "Open E2E Soup" });
  await expect(soupCard).toContainText("Saved through the recipe editor.");
  await expect(soupCard).toContainText("1 dependencies");
});

test("backup import writes IndexedDB data and export reads it back", async ({ page }) => {
  await page.goto("/backup");

  await page.getByLabel("Backup JSON").fill(JSON.stringify(backupFixture));
  await page.getByRole("button", { name: "Import JSON" }).click();
  await expect(
    page.getByText("Imported 1 repositories, 1 components, and 1 inventory items."),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("link", { name: "Repositories" }).click();
  const backupSoupCard = page.getByRole("link", { name: "Open Backup Soup" });
  await expect(backupSoupCard).toContainText("Imported through Backup JSON.");

  await page.getByRole("link", { exact: true, name: "Backup" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  const exported = JSON.parse(await readFile(downloadPath ?? "", "utf8"));
  expect(exported.repositories).toEqual(
    expect.arrayContaining([expect.objectContaining({ slug: "backup-soup" })]),
  );
  expect(exported.components).toEqual(
    expect.arrayContaining([expect.objectContaining({ recipeId: "recipe-backup-soup" })]),
  );
  expect(exported.inventoryItems).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "inventory-backup-rice" })]),
  );
});
