import { expect, test } from "@playwright/test";

test("pointer construction drags nodes and draws an edge", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "+ Observed" }).click();
  await page.getByRole("button", { name: "+ Observed" }).click();

  const first = page.locator('[data-node-id="node-0"]');
  const second = page.locator('[data-node-id="node-1"]');
  const canvas = page.getByLabel("Causal graph editor");
  await canvas.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await first.click();
  await page.getByRole("button", { name: "Set X" }).click();
  await second.click();
  await page.getByRole("button", { name: "Set Y" }).click();

  const firstCircle = first.locator("circle").first();
  const before = await firstCircle.getAttribute("cx");
  const box = await firstCircle.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!box) throw new Error("First graph node did not have a pointer target.");
  if (!canvasBox) throw new Error("Graph canvas did not have a pointer target.");
  await firstCircle.dragTo(canvas, {
    force: true,
    targetPosition: {
      x: box.x - canvasBox.x + box.width / 2 + 80,
      y: box.y - canvasBox.y + box.height / 2 + 32,
    },
  });
  await expect(firstCircle).not.toHaveAttribute("cx", before ?? "");

  await first.click();
  await page.getByRole("button", { name: "Draw edge" }).click();
  await second.click();
  await expect(page.locator('svg path[marker-end="url(#causal-arrow)"]')).toHaveCount(1);
});
