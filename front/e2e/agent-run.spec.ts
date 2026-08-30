import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { PublicAgentRun } from "@/types/shopping";

const merchantEmail = "nomad-e2e-merchant@example.com";
const merchantPassword = "Nomad-e2e-sandbox-only-2026!";
const merchantBusinessName = "Nomad E2E Merchant";

function required(name: "SUPABASE_URL" | "SUPABASE_SECRET_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the real vertical E2E.`);
  return value;
}

function requireStripeSandbox(): void {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const profileId = process.env.STRIPE_PROFILE_ID?.trim() ?? "";
  if (!secretKey.startsWith("sk_test_") || secretKey.includes("local_dev_only")) {
    throw new Error("STRIPE_SECRET_KEY must be a real Stripe test-mode secret for the settlement E2E.");
  }
  if (!profileId || profileId.includes("local_dev_only")) {
    throw new Error("STRIPE_PROFILE_ID must be a real Stripe sandbox Business Network profile for the settlement E2E.");
  }
}

const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureMerchant(): Promise<void> {
  let page = 1;
  let merchantId: string | undefined;
  while (!merchantId) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    merchantId = data.users.find((user) => user.email === merchantEmail)?.id;
    if (merchantId || data.users.length < 200) break;
    page += 1;
  }
  if (!merchantId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: merchantEmail,
      password: merchantPassword,
      email_confirm: true,
      user_metadata: { business_name: merchantBusinessName },
    });
    if (error || !data.user) throw error ?? new Error("The E2E merchant was not created.");
    merchantId = data.user.id;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(merchantId, {
      password: merchantPassword,
      email_confirm: true,
      user_metadata: { business_name: merchantBusinessName },
    });
    if (error) throw error;
  }
  const { error: profileError } = await supabase.from("merchant_profiles").upsert({
    user_id: merchantId,
    business_name: merchantBusinessName,
    status: "active",
  });
  if (profileError) throw profileError;
}

async function addVirtualAuthenticator(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

async function authenticateBuyer(page: Page): Promise<void> {
  await page.goto("/profile");
  const biometric = page.getByRole("button", { name: "Test biometry" });
  await expect(biometric).toBeEnabled();
  await biometric.click();
  await expect(page.getByText(/Biometric check succeeded/i)).toBeVisible();
  await biometric.click();
  await expect(page.getByText("Authentication successful.")).toBeVisible();
  await expect(page.getByText("Authenticated", { exact: true })).toBeVisible();
}

async function latestRun(page: Page, goal: string): Promise<PublicAgentRun> {
  return page.evaluate<PublicAgentRun, string>(async (expectedGoal) => {
    const token = sessionStorage.getItem("brasilia-dog.passkey-session");
    const response = await fetch("/api/agent-runs", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json() as { data: { runs: PublicAgentRun[] } };
    if (!response.ok) throw new Error(JSON.stringify(body));
    const run = body.data.runs.find((item: { goal: string }) => item.goal === expectedGoal);
    if (!run) throw new Error(`Run not found for ${expectedGoal}`);
    return run;
  }, goal);
}

async function startRunFromBuyerUI(page: Page, goal: string): Promise<PublicAgentRun> {
  await page.goto("/assistant");
  const composer = page.getByLabel("Describe what you want to buy");
  await expect(composer).toBeEnabled();
  await composer.fill(goal);
  await page.getByRole("button", { name: "Send request" }).click();
  const approve = page.getByRole("button", { name: "Approve search mandate" });
  await expect(approve).toBeVisible({ timeout: 45_000 });
  await approve.click();
  await expect(page.getByRole("dialog")).toContainText("Confirm your identity");
  await page.getByRole("button", { name: "Confirm with passkey" }).click();
  await expect(page.getByText(/Run monitoring/i)).toBeVisible({ timeout: 45_000 });
  return latestRun(page, goal);
}

async function loginMerchant(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/merchant/login");
  await page.getByLabel("Work email").fill(merchantEmail);
  await page.locator('input[name="password"]').fill(merchantPassword);
  await page.getByRole("button", { name: "Enter Merchant OS", exact: true }).click();
  await expect(page).toHaveURL(/\/merchant\/dashboard/);
  return { context, page };
}

async function publishProduct(page: Page, input: {
  name: string;
  slug: string;
  category: string;
  screenSize: number;
  price: string;
}): Promise<void> {
  await page.goto("/merchant/catalog");
  await page.getByRole("button", { name: /Add (first )?product/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Product name").fill(input.name);
  await dialog.getByLabel("SKU / slug").fill(input.slug);
  await dialog.getByLabel("Fixed price").fill(input.price);
  await dialog.getByLabel("Description").fill("A real Stripe MPP sandbox product published by the Playwright merchant flow.");
  await dialog.getByLabel("Metadata value").first().fill(input.category);
  await dialog.getByRole("button", { name: "Field", exact: true }).click();
  await dialog.getByLabel("Metadata key").nth(1).fill("screen_size_inches");
  await dialog.getByLabel("Metadata type").nth(1).selectOption("number");
  await dialog.getByLabel("Metadata value").nth(1).fill(String(input.screenSize));
  await dialog.getByRole("button", { name: "Create draft" }).click();
  const row = page.getByRole("row").filter({ hasText: input.slug });
  await expect(row).toBeVisible();
  page.once("dialog", (confirmation) => confirmation.accept());
  await row.getByRole("button", { name: "Publish" }).click();
  await expect(row.getByText("Live")).toBeVisible();
}

async function assertSettledInBuyerAndMerchant(
  buyerPage: Page,
  merchantPage: Page,
  goal: string,
  productName: string,
): Promise<PublicAgentRun> {
  await expect.poll(async () => {
    const status = (await latestRun(buyerPage, goal)).status;
    return ["completed", "rejected", "failed"].includes(status) ? status : "pending";
  }, { timeout: 60_000 }).not.toBe("pending");
  const run = await latestRun(buyerPage, goal);
  expect(run.status).toBe("completed");
  expect(run.proofId).toBeTruthy();
  expect(run.paymentAttempt?.status).toBe("settled");
  expect(run.receipt?.reference).toBeTruthy();
  if (!run.paymentAttempt?.id || !run.proofId) throw new Error("The settled run omitted its payment evidence.");
  await expect(buyerPage.getByText("Stripe MPP settled")).toBeVisible();
  await expect(buyerPage.getByText(productName, { exact: true }).first()).toBeVisible();

  await merchantPage.goto("/merchant/orders");
  await expect(merchantPage.getByText(productName, { exact: true })).toBeVisible({ timeout: 30_000 });
  await merchantPage.getByText(productName, { exact: true }).click();
  const drawer = merchantPage.getByRole("dialog");
  await expect(drawer).toContainText(run.paymentAttempt.id);
  await expect(drawer).toContainText(run.proofId);
  return run;
}

test.describe.serial("mandate → durable agent-run → Stripe MPP", () => {
  test.beforeAll(async () => {
    requireStripeSandbox();
    await ensureMerchant();
  });

  test("buyer approves, merchant publishes and the same settled transaction reaches both projections", async ({ browser, page, context }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const category = `e2e-immediate-${suffix}`;
    const goal = `Prepare a purchase mandate now for a 34-inch display in the exact marketplace category ${category}, up to $300. Do not browse products.`;
    const productName = `E2E Immediate Display ${suffix}`;
    const slug = `e2e-immediate-${suffix}`;
    await addVirtualAuthenticator(context, page);
    await authenticateBuyer(page);
    const started = await startRunFromBuyerUI(page, goal);
    expect(started.status).toBe("monitoring");
    expect(started.mandate?.version).toBe(1);

    const merchant = await loginMerchant(browser);
    await publishProduct(merchant.page, { name: productName, slug, category, screenSize: 34, price: "292.43" });
    await assertSettledInBuyerAndMerchant(page, merchant.page, goal, productName);
    await merchant.context.close();
  });

  test("expiry resumes the same mandate at version two before later publication and settlement", async ({ browser, page, context }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const category = `e2e-resume-${suffix}`;
    const screenSize = 100 + Math.floor(Math.random() * 90);
    const goal = `Prepare a purchase mandate now for a ${screenSize}-inch display in the exact marketplace category ${category}, up to $250. Do not browse products.`;
    const productName = `E2E Resumed Display ${suffix}`;
    const slug = `e2e-resumed-${suffix}`;
    await addVirtualAuthenticator(context, page);
    await authenticateBuyer(page);
    const expiredRun = await startRunFromBuyerUI(page, goal);
    const mandateId = expiredRun.mandateId;

    await expect(page.getByRole("button", { name: "Extend mandate for 60 seconds" })).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: "Extend mandate for 60 seconds" }).click();
    await expect(page.getByText(/Run monitoring/i)).toBeVisible({ timeout: 45_000 });
    const resumedRun = await latestRun(page, goal);
    expect(resumedRun.runId).toBe(expiredRun.runId);
    expect(resumedRun.mandateId).toBe(mandateId);
    expect(resumedRun.mandate?.version).toBe(2);
    expect(resumedRun.extensionId).toBeTruthy();

    const merchant = await loginMerchant(browser);
    await publishProduct(merchant.page, { name: productName, slug, category, screenSize, price: "249.00" });
    const settled = await assertSettledInBuyerAndMerchant(page, merchant.page, goal, productName);
    expect(settled.mandateId).toBe(mandateId);
    expect(settled.mandate?.version).toBe(2);
    await merchant.context.close();
  });
});
