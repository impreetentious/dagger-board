import { expect, test } from "@playwright/test";

test("static routes render, theme persists, and requests stay local", async ({ page }) => {
  const externalRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      externalRequests.push(url.toString());
    }
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.goto("/lab");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/learn");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  expect(externalRequests).toEqual([]);
});
