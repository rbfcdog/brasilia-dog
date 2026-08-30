import type { NextConfig } from "next";
import dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspaceEnvironmentPath = resolve(process.cwd(), "..", ".env");
const combinedEnv = existsSync(workspaceEnvironmentPath)
  ? dotenv.parse(readFileSync(workspaceEnvironmentPath))
  : {};
for (const name of ["BACKEND_API_URL", "AGENT_SERVICE_URL", "AGENT_SERVICE_TOKEN", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_DEMO_BUYER_USER_ID"] as const) {
  if (!process.env[name]?.trim() && combinedEnv[name]?.trim()) process.env[name] = combinedEnv[name];
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
}
if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) {
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
}

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
