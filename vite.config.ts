import react from "@vitejs/plugin-react";
import { configDefaults, coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/dexie")) {
            return "dexie";
          }
          if (id.includes("/node_modules/@primer/")) {
            return "primer";
          }
        },
      },
    },
  },
  test: {
    coverage: {
      enabled: true,
      exclude: [
        ...coverageConfigDefaults.exclude,
        "src/**/*.test.{ts,tsx}",
        "src/main.tsx",
        "src/test/**",
        "src/vite-env.d.ts",
      ],
      include: ["src/**/*.{ts,tsx}"],
      provider: "v8",
      reportOnFailure: true,
      reporter: ["text", "json-summary", "json", "html"],
      reportsDirectory: "coverage",
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
    deps: {
      web: {
        transformCss: true,
      },
    },
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
