import { expect, test } from "@playwright/test";

test("all six Learn scenarios expose their /learn/[slug] entry from the index", async ({
  page,
}) => {
  await page.goto("/learn");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Commit to a choice");
  for (const slug of [
    "confounding",
    "overcontrol",
    "collider-trap",
    "m-bias",
    "selection-bias",
    "measurement-error",
  ]) {
    // trailingSlash: true in next.config → static-export hrefs carry the slash.
    await expect(page.locator(`a[href='/learn/${slug}/']`)).toBeVisible();
  }
});

test("a scenario is playable end-to-end (setup → act → observe → reveal)", async ({ page }) => {
  await page.goto("/learn/collider-trap");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Collider trap");

  await page.getByRole("button", { name: /Continue to the choice/i }).click();
  await page.getByRole("button", { name: /Regress Y on X — do not condition on C/i }).click();
  await page.getByRole("button", { name: /Show the anatomy/i }).click();

  const summary = page.getByTestId("learn-choice-result");
  await expect(summary).toContainText(/recommended read/);
  // trailingSlash: true → the workbench link is "/lab/#g=…" (the slash is
  // harmless; /lab/ decodes the same fragment).
  await expect(page.getByTestId("open-in-lab")).toHaveAttribute("href", /^\/lab\/?#g=/);
});
