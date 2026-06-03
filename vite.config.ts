import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // Emit source maps so prod crash stacks point at the original code
    // (single-letter minified names are useless for debugging recharts
    // crashes). Costs ~7MB of extra files but they sit alongside the
    // bundle, only downloaded if the user opens devtools.
    sourcemap: true,
    // Split heavy dependencies into their own chunks so the initial JS
    // download is leaner and pages that don't need them (e.g. Dashboard)
    // don't pay the recharts / html2pdf tax.
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-charts":   ["recharts"],
          "vendor-pdf":      ["html2pdf.js"],
          "vendor-xlsx":     ["xlsx"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-radix":    [
            "@radix-ui/react-dialog",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-tabs",
          ],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
}));
