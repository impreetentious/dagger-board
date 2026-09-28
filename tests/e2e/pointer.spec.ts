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

// The zoom handler has to consume the wheel event. React registers `wheel`
// passively, so an onWheel prop cannot: the browser logs an error and scrolls
// the page out from under the canvas while it zooms.
test("wheel zoom consumes the event instead of scrolling the page", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/lab");
  await page.getByRole("button", { name: "Load M-bias" }).click();
  const canvas = page.getByLabel("Causal graph editor");
  await canvas.evaluate((element) => element.scrollIntoView({ block: "center" }));

  const before = await canvas.getAttribute("viewBox");
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Graph canvas did not have a pointer target.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);

  await expect(canvas).not.toHaveAttribute("viewBox", before ?? "");
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  expect(consoleErrors).toEqual([]);
});

// The static export is prerendered without browser storage, so anything read
// from it during render has to wait for mount or hydration fails.
test("a saved model does not break hydration on reload", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/lab");
  await page.locator("summary", { hasText: "Save, share, and interchange" }).click();
  await page.getByRole("button", { name: "Save locally" }).click();
  await expect(page.getByText("Saved in this browser.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.locator("summary", { hasText: "Save, share, and interchange" }).click();
  await expect(page.getByText("SAVED MODELS")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

// A drag emits one store edit per pointer move. Recording each of those as its
// own history entry made undo useless: a couple of drags evicted every
// structural edit from the hundred-entry stack, and each Ctrl+Z only walked the
// node back eight pixels.
test("a drag costs one undo step, not one per pointer move", async ({ page }) => {
  const dragBy = async (steps: number) => {
    const box = await page.locator('[data-node-id="x"] circle').first().boundingBox();
    if (!box) throw new Error("The exposure node had no pointer target.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let step = 1; step <= steps; step += 1) {
      await page.mouse.move(box.x + box.width / 2 + step * 4, box.y + box.height / 2 + step * 2);
    }
    await page.mouse.up();
  };

  await page.goto("/lab");
  await page.getByRole("button", { name: "Load M-bias" }).click();
  const canvas = page.getByLabel("Causal graph editor");
  await canvas.evaluate((element) => element.scrollIntoView({ block: "center" }));

  const circle = page.locator('[data-node-id="x"] circle').first();
  const start = await circle.getAttribute("cx");
  await dragBy(30);
  const afterFirst = await circle.getAttribute("cx");
  expect(afterFirst).not.toBe(start);
  await dragBy(20);
  expect(await circle.getAttribute("cx")).not.toBe(afterFirst);

  await canvas.focus();
  await page.keyboard.press("Control+z");
  await expect(circle).toHaveAttribute("cx", afterFirst ?? "");
  await page.keyboard.press("Control+z");
  await expect(circle).toHaveAttribute("cx", start ?? "");

  // The example load that preceded both drags is still reachable.
  await page.keyboard.press("Control+z");
  await expect(page.locator("[data-node-id]")).toHaveCount(0);
});
