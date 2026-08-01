import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"]
    },
    environment: "node",
    setupFiles: ["tests/setup/no-external-network.ts"],
    include: ["tests/**/*.test.ts"]
  }
});
