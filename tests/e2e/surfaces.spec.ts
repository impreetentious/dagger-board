import { expect, test } from "@playwright/test";

test("M-bias supports Prove, Simulate, and Design readouts", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Load M-bias" }).click();

  await page.getByRole("tab", { name: /Prove/i }).click();
  await expect(page.getByText("TE ≡ 0 under your own assumptions.")).toBeVisible();

  await page.getByRole("tab", { name: /Simulate/i }).click();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByText(/Exact estimand 0\.0000/)).toBeVisible();

  await page.getByRole("tab", { name: /Design/i }).click();
  await expect(page.getByLabel("Design estimator table")).toContainText("Naive (∅)");
  await expect(page.getByLabel("Design estimator table")).toContainText("0.0000");
});

test("deleting a conditioned node clears it from the Prove playground", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Load M-bias" }).click();
  await page.getByRole("tab", { name: /Prove/i }).click();
  await page.getByRole("checkbox", { name: "M" }).check();

  await page.getByRole("tab", { name: /Draw/i }).click();
  await page.locator('[data-node-id="m"]').click();
  await page.getByRole("button", { name: "Delete node" }).click();

  await page.getByRole("tab", { name: /Prove/i }).click();
  await expect(page.getByRole("checkbox", { name: "M" })).toHaveCount(0);
  await expect(page.getByRole("alert")).not.toContainText(/error/i);
});
