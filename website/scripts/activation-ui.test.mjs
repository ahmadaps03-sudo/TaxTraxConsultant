import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { sessionTestBuild } from "./lib/session-test-build.mjs";

test("real Next.js setup UI stays anonymous and fails closed when the provider is unavailable", async () => {
  const build = await sessionTestBuild([
    "lib/auth/request.ts", "lib/auth/handlers.ts", "lib/auth/activation.ts", "lib/validation.ts",
    "app/portal/page.tsx", "components/portal/PortalClient.tsx", "app/portal/activate/page.tsx", "components/portal/ActivationForm.tsx",
    ...["callback", "verify", "password"].map(route => `app/api/auth/activation/${route}/route.ts`),
  ], { realPortal: true });
  let browser;
  try {
    const origin = await build.start({ SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic" }, { authOrigin: true });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${origin}/portal`);
    assert.equal(await page.getByRole("heading", { name: "Client Portal Login", exact: true }).count(), 1);
    assert.equal(await page.getByRole("link", { name: /First-time user/ }).count(), 0);
    assert.equal(await page.getByText("First-time user? Use the invitation email from TaxTrax to set up your account.", { exact: true }).count(), 1);
    await page.getByRole("tab", { name: "Create account", exact: true }).click();
    await page.getByRole("heading", { name: "Create your account", exact: true }).waitFor();
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    await page.getByRole("tab", { name: "Log in", exact: true }).click();
    await page.getByRole("heading", { name: "Client Portal Login", exact: true }).waitFor();
    await page.goto(`${origin}/portal/activate`);
    const empty = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/activation/verify");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal((await empty).status(), 401);
    assert.equal(await page.getByLabel("First password", { exact: true }).count(), 0);
    const hash = "c".repeat(64);
    await page.goto(`${origin}/api/auth/activation/callback?token_hash=${hash}&type=invite`);
    assert.equal(page.url(), `${origin}/portal/activate`);
    const cookies = await context.cookies();
    assert.ok(cookies.some(cookie => cookie.name === "taxtrax-activation-link" && cookie.httpOnly && cookie.path === "/api/auth/activation"));
    assert.ok(!(await page.evaluate(() => document.documentElement.innerHTML + document.cookie)).includes(hash));
    const failed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/activation/verify");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal((await failed).status(), 503);
    await page.getByText("Account setup is temporarily unavailable. Please try again.", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("First password", { exact: true }).count(), 0);
    await page.goto(`${origin}/portal`);
    assert.equal(await page.getByRole("heading", { name: /^Welcome,/ }).count(), 0);
    assert.ok(!(await context.cookies()).some(cookie => cookie.name.startsWith("sb-") && cookie.value));
  } finally { await browser?.close(); await build.stop(); }
});
