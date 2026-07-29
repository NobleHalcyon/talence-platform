import { defineConfig, devices } from "@playwright/test";

import { readLocalSupabaseStatus } from "../../scripts/lib/local-supabase.mjs";

const localSupabase = readLocalSupabaseStatus();
const port = 3115;
const baseURL = `http://127.0.0.1:${port}`;
const browserChannel = process.env.PLAYWRIGHT_CHANNEL;
const channelOverride = browserChannel ? { channel: browserChannel } : {};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "phase5-live-device.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 180_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "phase5-live-chromium",
      use: { ...devices["Desktop Chrome"], ...channelOverride },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    env: {
      ...process.env,
      DEVICE_CREDENTIAL_PEPPER: "phase5-local-device-credential-pepper-2026",
      FEATURE_DEVICE_INVENTORY_WRITES_ENABLED: "true",
      FEATURE_SNAPSHOT_DOWNLOADS_ENABLED: "true",
      NEXT_PUBLIC_APP_ORIGIN: baseURL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localSupabase.publishableKey,
      NEXT_PUBLIC_SUPABASE_URL: localSupabase.apiUrl,
      SUPABASE_SECRET_KEY: localSupabase.secretKey,
      TALENCE_ENABLE_STATIC_APP_PREVIEW: "false",
    },
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
