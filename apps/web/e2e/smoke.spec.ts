/**
 * Smoke test: the app shell renders, in English left-to-right and in Arabic right-to-left.
 *
 * Module:   app shell (apps/web/e2e)
 * Serves:   FR-18 (localization, RTL) · slice 01b item 3 ("prove LTR and RTL with the smoke test")
 *
 * The browser locale sets the Accept-Language header, which is how the root layout picks the
 * locale today. Expected text comes from the catalogue, so a copy change cannot break the test.
 */
import { expect, test } from "@playwright/test";
import { MESSAGES } from "../src/modules/shared";

test.describe("FR-18 root layout language and direction", () => {
  test.describe("English browser", () => {
    test.use({ locale: "en-US" });

    test("renders lang=en, dir=ltr and English text", async ({ page }) => {
      await page.goto("/");

      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(MESSAGES.en["app.name"]);
      await expect(page).toHaveTitle(MESSAGES.en["app.name"]);
    });
  });

  test.describe("Arabic browser (regional tag ar-JO)", () => {
    test.use({ locale: "ar-JO" });

    test("renders lang=ar, dir=rtl and Arabic text", async ({ page }) => {
      await page.goto("/");

      await expect(page.locator("html")).toHaveAttribute("lang", "ar");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(MESSAGES.ar["app.name"]);
      await expect(page).toHaveTitle(MESSAGES.ar["app.name"]);
    });
  });
});
