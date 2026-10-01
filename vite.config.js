import { defineConfig } from "vite";

// Bundles the Express server (not a website) into a single dist/index.js,
// with all dependencies included so node_modules is not needed to run it.
export default defineConfig({
  build: {
    ssr: "src/index.js",
    outDir: "dist",
    target: "node20",
    emptyOutDir: true,
    rollupOptions: {
      output: { format: "es", entryFileNames: "index.js" },
    },
  },
  ssr: {
    noExternal: true,
  },
});
