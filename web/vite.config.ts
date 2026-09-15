import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  // Where the site is mounted. "/" for a host of its own; GitHub Pages serves a project
  // site from "/<repo>/", and the Pages workflow passes that in. Everything that needs
  // the prefix reads it back from `import.meta.env.BASE_URL`.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
