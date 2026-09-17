import { expect, test } from "@playwright/test";
import { SEED_USERS } from "../../db/seed";

const enabled = process.env.E2E_SEED === "1" && !!process.env.NEXT_PUBLIC_SUPABASE_URL;

test("GET /api/health returns ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toEqual({ ok: true });
});

test.describe("seeded flow", () => {
  test.skip(!enabled, "needs E2E_SEED=1 and NEXT_PUBLIC_SUPABASE_URL");

  test("Ana signs in, answers three Mini-IPIP items, and resumes at item 4 after a reload", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(SEED_USERS.ana.email);
    await page.getByLabel("Password").fill(process.env.E2E_PASSWORD ?? "the-plan-e2e");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/setup/);
    await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();

    await page.goto("/instruments");
    await expect(page.getByRole("heading", { name: "Questionnaires" })).toBeVisible();
    await page.getByRole("link", { name: "Mini-IPIP" }).click();
    await page.waitForURL(/\/instruments\/mini_ipip/);

    // Start from item 1 whatever was answered before.
    const back = page.getByRole("button", { name: "Back" });
    for (let i = 0; i < 40 && (await back.isEnabled()); i++) await back.click();
    await expect(page.getByText(/Item 1 of \d+/)).toBeVisible();

    for (let i = 1; i <= 3; i++) {
      await expect(page.getByText(new RegExp(`Item ${i} of \\d+`))).toBeVisible();
      await page.getByRole("radio").first().check();
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();
      // Answering moves on by itself.
      await expect(page.getByText(new RegExp(`Item ${i + 1} of \\d+`))).toBeVisible();
    }

    await page.reload();
    await expect(page.getByText(/Item 4 of \d+/)).toBeVisible();
  });
});
