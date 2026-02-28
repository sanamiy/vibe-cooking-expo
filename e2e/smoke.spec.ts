import { test, expect } from "@playwright/test";

test("home -> recipe detail shows selected recipe", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("献立を決める")).toBeVisible();

  // Pick a deterministic recipe from data/recipe.json (first item as of now)
  const recipeName = "たっぷり野菜のミネストローネ";
  await page.getByText(recipeName, { exact: true }).click();

  // Confirm button appears and navigate
  await page.getByText("決定する", { exact: true }).click();

  // Recipe detail screen
  await expect(page).toHaveURL(/\/recipe\//);
  await expect(
    page.locator("div:visible", { hasText: recipeName }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("買い出しリストへ進む", { exact: true }),
  ).toBeVisible();
});
