import { defineConfig, devices } from "@playwright/test";

import { readLocalSupabaseStatus } from "../../scripts/lib/local-supabase.mjs";

const localSupabase = readLocalSupabaseStatus();
const baseURL = "http://localhost:3000";
const browserChannel = process.env.PLAYWRIGHT_CHANNEL;
const channelOverride = browserChannel ? { channel: browserChannel } : {};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "auth-email-live.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 240_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "auth-email-live-chromium",
      use: { ...devices["Desktop Chrome"], ...channelOverride },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3000",
    env: {
      ...process.env,
      FEATURE_INVITATIONS_ENABLED: "true",
      NEXT_PUBLIC_APP_ORIGIN: baseURL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localSupabase.publishableKey,
      NEXT_PUBLIC_SUPABASE_URL: localSupabase.apiUrl,
      SUPABASE_SECRET_KEY: localSupabase.secretKey,
      TALENCE_ENABLE_STATIC_APP_PREVIEW: "false",
    },
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    stdout: "ignore",
    timeout: 180_000,
  },
});
