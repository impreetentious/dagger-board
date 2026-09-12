import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("keyboard-only construction assigns roles, kinds, and causal edges", async ({ page }) => {
  await page.goto("/lab");
  const canvas = page.getByLabel("Causal graph editor");
  await canvas.focus();
  for (let count = 0; count < 5; count += 1) await page.keyboard.press("n");
  await expect(page.locator('[data-node-id="node-4"]')).toBeVisible();

  await page.keyboard.press("y");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("x");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("l");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("l");

  const edge = async (steps: number) => {
    await page.keyboard.press("e");
    for (let index = 0; index < steps; index += 1) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
  };
  await edge(2); // U1 -> X
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await edge(3); // U1 -> M
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await edge(2); // U2 -> M
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await edge(3); // U2 -> Y

  await expect(page.locator('svg path[marker-end="url(#causal-arrow)"]')).toHaveCount(4);
  await expect(page.getByText("X", { exact: true })).toBeVisible();
  await expect(page.getByText("Y", { exact: true })).toBeVisible();
});

test("all shipped routes and workbench surfaces have no automated accessibility violations", async ({
  page,
}) => {
  for (const route of ["/", "/learn", "/learn/m-bias"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  }
  await page.goto("/lab");
  await page.getByRole("button", { name: "Load M-bias" }).click();
  for (const surface of ["Draw", "Prove", "Simulate", "Design", "Communicate"]) {
    await page.getByRole("tab", { name: new RegExp(surface) }).click();
    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  }
});
