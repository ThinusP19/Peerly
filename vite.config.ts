// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Pinned to a port nothing else on this machine uses. The default (8080) is
  // shared with other projects here, and two apps on one origin collide badly:
  // the browser reuses the origin's cache and service worker, so you get one
  // app's server HTML hydrated by another app's JavaScript.
  // strictPort makes a clash fail loudly instead of silently drifting.
  vite: {
    server: {
      host: "127.0.0.1",
      port: 7331,
      strictPort: true,
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
