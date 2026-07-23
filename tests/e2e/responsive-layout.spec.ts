import { expect, test } from "@playwright/test";

test("repository detail fits a mobile viewport and exposes keyboard navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/me/curry-rice");
  await expect(page.getByRole("heading", { name: "Curry Rice" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate<boolean>(
    "document.documentElement.scrollWidth > document.documentElement.clientWidth",
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();

  const codeTab = page.getByRole("tab", { name: "Code" });
  await codeTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Dependencies" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
