import { expect, test } from "@playwright/test";

const scenarios = [
  ["confounding", "Confounding"],
  ["overcontrol", "Mediator overcontrol"],
  ["collider-trap", "Collider trap"],
  ["m-bias", "M-bias"],
  ["selection-bias", "Selection bias"],
  ["measurement-error", "Measurement error"],
] as const;

test("all six Learn scenarios expose their /learn/[slug] entry from the index", async ({
  page,
}) => {
  await page.goto("/learn");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Commit to a choice");
  for (const [slug] of scenarios) {
    // trailingSlash: static-export hrefs carry a final slash.
    await expect(page.locator(`a[href='/learn/${slug}/']`)).toBeVisible();
  }
});

for (const [slug, title] of scenarios) {
  test(`${slug} is completable from setup through reveal`, async ({ page }) => {
    await page.goto(`/learn/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    await page.getByRole("button", { name: /Continue to the choice/i }).click();
    await page.getByLabel("Commit to a choice").getByRole("button").first().click();
    await page.getByRole("button", { name: /Show the anatomy/i }).click();

    await expect(page.getByTestId("learn-choice-result")).toBeVisible();
    await expect(page.getByTestId("learn-path-anatomy-overlay")).toBeVisible();
    await expect(page.getByTestId("open-in-lab")).toHaveAttribute("href", /^\/lab\/?#g=/);
  });
}
