import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
    maxWorkers: 2,
    pool: "threads",
    setupFiles: ["./tests/setup.ts"],
  },
});
