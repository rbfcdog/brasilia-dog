import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspaceRoot = resolve(process.cwd(), "..");
const combinedEnv = dotenv.parse(readFileSync(resolve(workspaceRoot, ".env")));
for (const name of [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_DEMO_BUYER_USER_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_PROFILE_ID",
  "MPP_SECRET_KEY",
] as const) {
  if (combinedEnv[name]) process.env[name] = combinedEnv[name];
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: "http://localhost:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "npm --prefix ../api start",
      url: "http://127.0.0.1:3000/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npm --prefix ../agent run build && npm --prefix ../agent start",
      url: "http://127.0.0.1:3001/health",
      reuseExistingServer: true,
      timeout: 60_000,
      env: { ...process.env, ADAPTER_MODE: "http" },
    },
    {
      command: "npm run build && npm start -- --port 3002",
      url: "http://127.0.0.1:3002/assistant",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
