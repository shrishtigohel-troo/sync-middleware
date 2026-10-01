import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Excludes the separate git-clone workspace folder (its own
    // node_modules/tests, not part of this project's actual test suite).
    exclude: ["**/node_modules/**", "**/gitwork/**"],
  },
});
