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

test("cook start plays start BGM (web e2e hook)", async ({ page }) => {
  await page.goto("/");

  const recipeName = "たっぷり野菜のミネストローネ";
  await page.getByText(recipeName, { exact: true }).click();
  await page.getByText("決定する", { exact: true }).click();
  await page.getByText("買い出しリストへ進む", { exact: true }).click();
  await page.getByText("スケジュールを作成", { exact: true }).click();
  await page.getByText("調理を開始する", { exact: true }).click();

  await expect(page).toHaveURL(/\/cook-interactive\//);

  await page.waitForFunction(() => {
    const v: any = (globalThis as any).__e2eStartBgm;
    return v && (v.startedAt || v.error);
  });

  const bgm = await page.evaluate(() => (globalThis as any).__e2eStartBgm);
  expect(bgm).toBeTruthy();
  expect(bgm.error).toBeNull();
  expect(typeof bgm.startedAt === "number").toBeTruthy();
});
