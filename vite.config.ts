import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * Plugin order matters: tsconfig paths and Tailwind first, then TanStack Start,
 * then React last — Start rewrites the route modules that the React plugin's
 * Fast Refresh transform then wraps, and reversing them breaks HMR.
 *
 * Nitro is build-only. Loading it in dev would push the dev server through the
 * production request pipeline, which is neither faster nor what we serve.
 */
export default defineConfig(({ command }) => ({
  // Pinned to a port nothing else on this machine uses. The default (8080) is
  // shared with other projects here, and two apps on one origin collide badly:
  // the browser reuses the origin's cache and service worker, so you get one
  // app's server HTML hydrated by another app's JavaScript.
  // strictPort makes a clash fail loudly instead of silently drifting.
  server: {
    host: "127.0.0.1",
    port: 7331,
    strictPort: true,
  },

  resolve: {
    // A second copy of React or the router silently breaks hooks and context.
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-store"],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    // `entry: "server"` routes the bundled server entry through src/server.ts,
    // our SSR error wrapper.
    tanstackStart({ server: { entry: "server" } }),
    ...(command === "build" ? [nitro()] : []),
    react(),
  ],
}));
