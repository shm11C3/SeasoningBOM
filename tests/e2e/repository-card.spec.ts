import { expect, test } from "@playwright/test";

test("repository cards behave like card-level links without hover underlines", async ({ page }) => {
  await page.goto("/");

  const curryCard = page.locator('.repo-card-link[href="/me/curry-rice"]');
  await expect(curryCard).toHaveCount(1);
  await expect(curryCard.locator("a")).toHaveCount(0);
  await expect(curryCard.locator(".repo-name")).toHaveText("me/curry-rice");

  await expect(curryCard).toHaveCSS("text-decoration-line", "none");
  await expect(curryCard.locator(".repo-name")).toHaveCSS("text-decoration-line", "none");

  await curryCard.hover();
  await expect(curryCard).toHaveCSS("background-color", "rgb(246, 248, 250)");
  await expect(curryCard).toHaveCSS("border-color", "rgb(175, 184, 193)");
  await expect(curryCard).toHaveCSS("text-decoration-line", "none");
  await expect(curryCard.locator(".repo-name")).toHaveCSS("text-decoration-line", "none");

  await curryCard.click({ position: { x: 24, y: 88 } });
  await expect(page).toHaveURL("/me/curry-rice");
  await expect(page.locator(".repo-path")).toContainText("curry-rice");
});
