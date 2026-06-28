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
    // Bucket every node_modules package into its own cacheable vendor chunk,
    // separate from the app's own code. Two wins: (1) the initial download
    // parallelises across chunks instead of one fat `index`, and (2) vendor
    // code (which rarely changes) stays cached across deploys — only the small
    // app chunk re-downloads when we ship. The React core stays in ONE chunk:
    // splitting react / react-dom / scheduler apart breaks module init order.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // React + routing core — must stay together and load first.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return "vendor-react";
          if (id.includes("@tanstack"))                                   return "vendor-query";
          if (id.includes("@radix-ui"))                                   return "vendor-radix";
          if (id.includes("recharts") || /[\\/]node_modules[\\/](d3-|victory-vendor)/.test(id)) return "vendor-charts";
          if (id.includes("html2pdf"))                                    return "vendor-pdf";
          if (/[\\/]node_modules[\\/]xlsx/.test(id))                      return "vendor-xlsx";
          if (id.includes("@supabase"))                                   return "vendor-supabase";
          if (id.includes("lucide-react"))                                return "vendor-icons";
          if (id.includes("framer-motion"))                               return "vendor-motion";
          if (id.includes("date-fns"))                                    return "vendor-date";
          // Everything else: let Vite's default splitting decide. Returning a
          // single "vendor" bucket here was a trap — it forced lazy-page-only
          // libs (carousel, day-picker, cmdk…) into the eager initial load.
          // Undefined keeps them co-located with the lazy chunk that uses them.
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
}));
