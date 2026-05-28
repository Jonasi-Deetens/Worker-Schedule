import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "tests/e2e/**", ".next"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/domain/**",
        "src/application/**",
        "src/interface/components/**",
        "src/lib/**",
      ],
    },
  },
});
