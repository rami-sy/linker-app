const { test, expect } = require("@playwright/test");

test.describe("Linker web shell", () => {
  test("welcome screen loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/welcome|auth/i);
  });
});
