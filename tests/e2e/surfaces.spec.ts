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

test("simulation evidence expires on seed edits and ADR inputs roundtrip", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Load M-bias" }).click();
  await page.getByRole("tab", { name: /Simulate/i }).click();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByText(/Captured simulation:/)).toBeVisible();
  await page.getByLabel("Simulation seed").fill("47");
  await expect(page.getByText(/Captured simulation:/)).toHaveCount(0);
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByText(/Captured simulation: seed 47,/)).toBeVisible();
  await page.getByRole("tab", { name: /Communicate/i }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("adr-download").click();
  const download = await downloadPromise;
  await page.getByRole("tab", { name: /Draw/i }).click();
  await page.getByRole("button", { name: "Load M-bias" }).click();
  await page.getByRole("tab", { name: /Communicate/i }).click();
  const bytes = await (await import("node:fs/promises")).readFile((await download.path())!);
  await page.evaluate(() => {
    const read = File.prototype.text;
    let release: (() => void) | undefined;
    Object.assign(window, { releaseAdrFile: () => release?.() });
    File.prototype.text = function () {
      if (this.name !== "held.json") return read.call(this);
      return new Promise<string>((resolve, reject) => {
        release = () => {
          void read.call(this).then(resolve, reject);
        };
      });
    };
  });
  await page
    .getByLabel("Import ADR JSON")
    .setInputFiles({ name: "held.json", mimeType: "application/json", buffer: bytes });
  await page
    .getByLabel("Import ADR JSON")
    .setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("null") });
  await expect(page.getByRole("status").filter({ hasText: /ADR/ })).toBeVisible();
  await page.evaluate(() => (window as unknown as { releaseAdrFile: () => void }).releaseAdrFile());
  await page.waitForTimeout(300);
  await expect(page.getByText(/Reproducible record imported/)).toHaveCount(0);
  await page.getByLabel("Import ADR JSON").setInputFiles((await download.path())!);
  await expect(page.getByText(/recomputed/i).first()).toBeVisible();
  await page.getByRole("tab", { name: /Simulate/i }).click();
  await expect(page.getByLabel("Simulation seed")).toHaveValue("47");
});
test("single-edge analysis applies one variant through normal undo", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Load M-bias" }).click();
  await page.getByRole("tab", { name: /Prove/i }).click();
  await page.getByRole("button", { name: "Analyze single-edge changes" }).click();
  await expect(
    page.getByText(/All structurally admissible single-edge variants inspected/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply this edge change" }).first().click();
  await expect(
    page.getByText(/All structurally admissible single-edge variants inspected/),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: /Draw/i }).click();
  await page.getByRole("button", { name: /Undo/ }).click();
  await page.getByRole("tab", { name: /Prove/i }).click();
  await expect(page.getByText("TE ≡ 0 under your own assumptions.")).toBeVisible();
});

test("canvas arrow tips remain outside the actual node outlines", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Load M-bias" }).click();
  const distances = await page.evaluate(() => {
    const centers = Array.from(document.querySelectorAll("[data-node-id]")).map((node) => {
      const circle = node.querySelector("circle");
      return { x: Number(circle?.getAttribute("cx")), y: Number(circle?.getAttribute("cy")) };
    });
    return Array.from(
      document.querySelectorAll<SVGPathElement>('path[marker-end="url(#causal-arrow)"]'),
    ).map((path) => {
      const start = path.getPointAtLength(0),
        end = path.getPointAtLength(path.getTotalLength());
      return [
        Math.min(...centers.map((center) => Math.hypot(start.x - center.x, start.y - center.y))),
        Math.min(...centers.map((center) => Math.hypot(end.x - center.x, end.y - center.y))),
      ];
    });
  });
  expect(distances.length).toBeGreaterThan(0);
  for (const pair of distances) for (const distance of pair) expect(distance).toBeCloseTo(32, 2);
});
