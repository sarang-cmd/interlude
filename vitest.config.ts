import { defineConfig } from "vitest/config";
export default defineConfig({
  define: { __PLATFORM__: JSON.stringify("extension") },
  test: { include: ["tests/unit/**/*.test.ts"], clearMocks: true, restoreMocks: true },
});
