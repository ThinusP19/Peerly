# Third-party licence register

This register covers requirements OR-17 (third-party licences documented and confirmed for post-handover use) and SI-11 (third-party components version-pinned, with licences recorded and confirmed).

It was compiled on 2026-09-22 from:

- `package.json` / `package-lock.json` (web app, repository root) and `server/package.json` / `server/package-lock.json` (API);
- the `license` field of each installed `node_modules/<pkg>/package.json`, cross-checked against the lockfile's `license` field (the two agreed for every direct dependency);
- a transitive scan with `npx license-checker-rseidelsohn --summary` in both packages, plus a script over every lockfile entry that also counts optional platform binaries not installed on this machine.

To re-run the scan after changing dependencies:

```sh
npm ci && npx --yes license-checker-rseidelsohn --summary
cd server && npm ci && npx --yes license-checker-rseidelsohn --summary
# Fails on the first package whose licence is not in the allow-list (today: buffers@0.1.1 in server/):
npx --yes license-checker-rseidelsohn --onlyAllow "MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;0BSD;MIT-0;Unlicense;BlueOak-1.0.0;Python-2.0;CC-BY-4.0;MPL-2.0" --excludePrivatePackages
```

## Conclusion

**All direct dependencies are permissively licensed**: MIT, ISC, Apache-2.0, BSD-2/3-Clause, MIT-0, and one MPL-2.0 test-only package. No direct dependency is GPL, AGPL, LGPL, commercial, or limited by a paid tier or quota, which also meets SI-12. The university may use, modify and host Peerly after handover without licence fees and without having to publish its own source code. The only obligation is the usual one for permissive licences: keep the copyright and licence notices. They ship inside `node_modules` and in the built bundles' licence comments.

Three items need attention before the register counts as *confirmed*:

1. **`buffers@0.1.1` declares no licence** (API, transitive, runtime). See [Flagged items](#flagged-items).
2. **Image provenance.** Two images in `public/` come from the Sponsor's `Content/` folder, and nobody has recorded their licence or permission. See [Brand assets, images and fonts](#brand-assets-images-and-fonts).
3. **Peerly's own licence and ownership.** Neither `package.json` declares a licence (both are `"private": true`), and the repository has no `LICENSE` file. The handover agreement should say who owns the Peerly source and on what terms the university may use it. **TODO (Sponsor / project owner).**

## Version pinning (SI-11)

- Most `package.json` entries use caret ranges (`^x.y.z`). The exact version of every package, direct and transitive, is fixed by the committed lockfiles (`package-lock.json`, `server/package-lock.json`). A few are pinned exactly in `package.json` itself: `@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/router-plugin`, `vite`, `nitro` (a beta), and `@axe-core/playwright`. The root `overrides` block also pins `rolldown` to `1.2.1`.
- **Always install with `npm ci`**, never `npm install`, for builds and deployments. `npm ci` installs exactly what the lockfile says and fails if `package.json` and the lockfile disagree. `npm install` may move caret ranges forward.
- The repository also contains a `bun.lock` and `bunfig.toml`, which are left over from earlier tooling. The npm lockfiles are authoritative. Deleting the Bun files, or keeping them in step, would avoid confusion.
- The versions in the tables below are the ones installed and locked on 2026-09-22.

---

## Direct dependencies: web app (repository root)

### Runtime (`dependencies`)

Some of these are used only at build time, for example `tailwindcss`, `@tailwindcss/vite` and `vite-tsconfig-paths`. They are still listed under `dependencies` in `package.json`.

| Package | Declared | Installed | Licence |
| --- | --- | --- | --- |
| @hookform/resolvers | ^5.2.2 | 5.9.1 | MIT |
| @radix-ui/react-accordion | ^1.2.12 | 1.2.20 | MIT |
| @radix-ui/react-alert-dialog | ^1.1.15 | 1.1.23 | MIT |
| @radix-ui/react-aspect-ratio | ^1.1.8 | 1.1.15 | MIT |
| @radix-ui/react-avatar | ^1.1.11 | 1.2.6 | MIT |
| @radix-ui/react-checkbox | ^1.3.3 | 1.3.11 | MIT |
| @radix-ui/react-collapsible | ^1.1.12 | 1.1.20 | MIT |
| @radix-ui/react-context-menu | ^2.2.16 | 2.3.7 | MIT |
| @radix-ui/react-dialog | ^1.1.15 | 1.1.23 | MIT |
| @radix-ui/react-dropdown-menu | ^2.1.16 | 2.1.24 | MIT |
| @radix-ui/react-hover-card | ^1.1.15 | 1.1.23 | MIT |
| @radix-ui/react-label | ^2.1.8 | 2.1.15 | MIT |
| @radix-ui/react-menubar | ^1.1.16 | 1.1.24 | MIT |
| @radix-ui/react-navigation-menu | ^1.2.14 | 1.2.22 | MIT |
| @radix-ui/react-popover | ^1.1.15 | 1.1.23 | MIT |
| @radix-ui/react-progress | ^1.1.8 | 1.1.16 | MIT |
| @radix-ui/react-radio-group | ^1.3.8 | 1.4.7 | MIT |
| @radix-ui/react-scroll-area | ^1.2.10 | 1.2.18 | MIT |
| @radix-ui/react-select | ^2.2.6 | 2.3.7 | MIT |
| @radix-ui/react-separator | ^1.1.8 | 1.1.15 | MIT |
| @radix-ui/react-slider | ^1.3.6 | 1.4.7 | MIT |
| @radix-ui/react-slot | ^1.2.4 | 1.3.3 | MIT |
| @radix-ui/react-switch | ^1.2.6 | 1.3.7 | MIT |
| @radix-ui/react-tabs | ^1.1.13 | 1.1.21 | MIT |
| @radix-ui/react-toggle | ^1.1.10 | 1.1.18 | MIT |
| @radix-ui/react-toggle-group | ^1.1.11 | 1.1.19 | MIT |
| @radix-ui/react-tooltip | ^1.2.8 | 1.2.16 | MIT |
| @tailwindcss/vite | ^4.2.1 | 4.3.3 | MIT |
| @tanstack/react-query | ^5.101.1 | 5.102.8 | MIT |
| @tanstack/react-router | 1.170.18 | 1.170.18 | MIT |
| @tanstack/react-start | 1.168.32 | 1.168.32 | MIT |
| @tanstack/router-plugin | 1.168.23 | 1.168.23 | MIT |
| class-variance-authority | ^0.7.1 | 0.7.1 | Apache-2.0 |
| clsx | ^2.1.1 | 2.1.1 | MIT |
| cmdk | ^1.1.1 | 1.1.1 | MIT |
| date-fns | ^4.1.0 | 4.4.0 | MIT |
| embla-carousel-react | ^8.6.0 | 8.6.0 | MIT |
| input-otp | ^1.4.2 | 1.5.0 | MIT |
| lucide-react | ^0.575.0 | 0.575.0 | ISC |
| react | ^19.2.0 | 19.2.8 | MIT |
| react-day-picker | ^9.14.0 | 9.14.0 | MIT |
| react-dom | ^19.2.0 | 19.2.8 | MIT |
| react-hook-form | ^7.71.2 | 7.86.0 | MIT |
| react-resizable-panels | ^4.6.5 | 4.12.3 | MIT |
| recharts | ^2.15.4 | 2.15.4 | MIT |
| sonner | ^2.0.7 | 2.0.8 | MIT |
| tailwind-merge | ^3.5.0 | 3.6.0 | MIT |
| tailwindcss | ^4.2.1 | 4.3.3 | MIT |
| tw-animate-css | ^1.3.4 | 1.4.0 | MIT |
| vaul | ^1.1.2 | 1.1.2 | MIT |
| vite-tsconfig-paths | ^6.0.2 | 6.1.1 | MIT |
| zod | ^3.24.2 | 3.25.76 | MIT |

### Development and build only (`devDependencies`)

| Package | Declared | Installed | Licence |
| --- | --- | --- | --- |
| @axe-core/playwright | 4.13.0 | 4.13.0 | MPL-2.0 |
| @eslint/js | ^9.32.0 | 9.39.5 | MIT |
| @playwright/test | ^1.63.0 | 1.63.0 | Apache-2.0 |
| @types/node | ^22.16.5 | 22.20.1 | MIT |
| @types/react | ^19.2.0 | 19.2.18 | MIT |
| @types/react-dom | ^19.2.0 | 19.2.5 | MIT |
| @vitejs/plugin-react | ^5.2.0 | 5.2.0 | MIT |
| eslint | ^9.32.0 | 9.39.5 | MIT |
| eslint-config-prettier | ^10.1.1 | 10.1.8 | MIT |
| eslint-plugin-prettier | ^5.2.6 | 5.5.6 | MIT |
| eslint-plugin-react-hooks | ^5.2.0 | 5.2.0 | MIT |
| eslint-plugin-react-refresh | ^0.4.20 | 0.4.26 | MIT |
| globals | ^15.15.0 | 15.15.0 | MIT |
| nitro | 3.0.260603-beta | 3.0.260603-beta | MIT |
| png-to-ico | ^3.0.2 | 3.0.2 | MIT |
| prettier | ^3.7.3 | 3.9.6 | MIT |
| sharp | ^0.35.4 | 0.35.4 | Apache-2.0 |
| typescript | ^5.8.3 | 5.9.3 | Apache-2.0 |
| typescript-eslint | ^8.56.1 | 8.68.0 | MIT |
| vite | 8.1.5 | 8.1.5 | MIT |
| vitest | ^3.2.7 | 3.2.7 | MIT |

`nitro` is a devDependency, but it produces the production server bundle in `.output/`, so its runtime code ships inside the build. It is MIT.

## Direct dependencies: API (`server/`)

### Runtime (`dependencies`)

| Package | Declared | Installed | Licence |
| --- | --- | --- | --- |
| bcryptjs | ^3.0.3 | 3.0.3 | BSD-3-Clause |
| cookie-parser | ^1.4.7 | 1.4.7 | MIT |
| cors | ^2.8.6 | 2.8.6 | MIT |
| dotenv | ^17.4.2 | 17.4.2 | BSD-2-Clause |
| exceljs | ^4.4.0 | 4.4.0 | MIT |
| express | ^5.2.1 | 5.2.1 | MIT |
| express-rate-limit | ^8.7.0 | 8.7.0 | MIT |
| helmet | ^8.3.0 | 8.3.0 | MIT |
| multer | ^2.4.0 | 2.4.0 | MIT |
| nodemailer | ^10.0.10 | 10.0.10 | MIT-0 |
| pg | ^8.23.0 | 8.23.0 | MIT |
| zod | ^4.5.2 | 4.5.2 | MIT |

### Development only (`devDependencies`)

| Package | Declared | Installed | Licence |
| --- | --- | --- | --- |
| @types/bcryptjs | ^2.4.6 | 2.4.6 | MIT |
| @types/cookie-parser | ^1.4.10 | 1.4.10 | MIT |
| @types/cors | ^2.8.19 | 2.8.19 | MIT |
| @types/express | ^5.0.6 | 5.0.6 | MIT |
| @types/multer | ^2.2.0 | 2.2.0 | MIT |
| @types/node | ^26.4.0 | 26.4.0 | MIT |
| @types/nodemailer | ^8.0.2 | 8.0.2 | MIT |
| @types/pg | ^8.23.1 | 8.23.1 | MIT |
| @vitest/coverage-v8 | ^4.1.11 | 4.1.11 | MIT |
| tsx | ^4.23.12 | 4.23.12 | MIT |
| typescript | ^7.0.2 | 7.0.2 | Apache-2.0 |
| vitest | ^4.1.11 | 4.1.11 | MIT |

## Code vendored into the repository

- **shadcn/ui** (MIT). The components under `src/components/ui/` were generated by the shadcn CLI (`components.json`) and now belong to this codebase. They are not an npm dependency. They are built on the Radix packages listed above.

## Platform software (not bundled)

| Component | Licence | Notes |
| --- | --- | --- |
| Node.js 24 LTS | MIT (bundles components under their own permissive licences) | Runtime for both processes |
| PostgreSQL 17 | PostgreSQL Licence (permissive, BSD/MIT-like) | Database |
| Reverse proxy (for example nginx or Apache httpd) | BSD-2-Clause / Apache-2.0 | Chosen by the university |

---

## Transitive dependencies

### Installed packages (`license-checker-rseidelsohn --summary`)

**Web app, 450 packages** (runtime and development):

| Licence | Count |
| --- | --- |
| MIT | 375 |
| ISC | 26 |
| Apache-2.0 | 24 |
| MPL-2.0 | 6 |
| BSD-3-Clause | 6 |
| BSD-2-Clause | 6 |
| LGPL-3.0-or-later | 1 |
| Python-2.0 | 1 |
| CC-BY-4.0 | 1 |
| Unlicense | 1 |
| BlueOak-1.0.0 | 1 |
| 0BSD | 1 |
| MIT AND ISC | 1 |

**API, 267 packages** (runtime and development):

| Licence | Count |
| --- | --- |
| MIT | 224 |
| ISC | 19 |
| BSD-3-Clause | 8 |
| Apache-2.0 | 6 |
| MIT* (inferred from a licence file) | 2 |
| MPL-2.0 | 2 |
| Unlicense | 1 |
| **UNKNOWN** | **1** |
| BSD-2-Clause | 1 |
| (MIT OR GPL-3.0-or-later) | 1 |
| MIT-0 | 1 |
| (MIT AND Zlib) | 1 |

The lockfiles also list optional platform-specific binaries that are not installed on the build machine. Counting those, the web lockfile has 568 entries (364 runtime and 204 development) and the API lockfile has 335 (181 runtime and 154 development). Those extra entries are more platform builds of `lightningcss` (MPL-2.0) and `@img/sharp-libvips-*` (LGPL-3.0-or-later). They add no new licence types.

### Flagged items

Every package that is not a plain permissive licence (MIT, ISC, Apache-2.0, BSD, 0BSD, MIT-0):

| Package | Where | Licence | Pulled in by | Assessment |
| --- | --- | --- | --- | --- |
| **buffers@0.1.1** | API runtime | **none declared** (no `license` field, no LICENSE file, no licence text in the README) | `exceljs → unzipper@0.10.14 → binary@0.3.0 → buffers` | **Needs attention.** Without a licence grant, the default position is "all rights reserved". The package is by the same author (substack) as `chainsaw` and `traverse` in the same tree, which are MIT/X11, and it has been widely redistributed on npm for over a decade. The practical risk is low, but it is not documented. Options: (a) record an accepted risk; (b) confirm the licence from the upstream repository `github.com/substack/node-buffers`; (c) check with the university's legal office. Peerly's class-list parser uses `workbook.xlsx.load()`, which goes through `jszip`, so this streaming-reader dependency is installed but most likely never runs. It still ships in `node_modules`. **TODO (university IT / legal): choose (a), (b) or (c) and record the decision here.** |
| jszip@3.10.2 | API runtime | MIT OR GPL-3.0-or-later | exceljs | Dual-licensed. Peerly uses it under **MIT**. No copyleft obligation. |
| lightningcss@1.32.0 / 1.33.0 (+ platform binaries) | Web build | MPL-2.0 | tailwindcss / @tailwindcss/vite, vite | A build-time CSS compiler. MPL-2.0 is weak, file-level copyleft that applies only if the *lightningcss source files themselves* are modified and distributed. Its output (Peerly's CSS) is not covered. No obligation. |
| axe-core@4.13.0, @axe-core/playwright@4.13.0 | Web dev (tests) | MPL-2.0 | Accessibility tests | Test-only, not distributed. No obligation. |
| @img/sharp-libvips-* | Web dev | LGPL-3.0-or-later | sharp (brand asset generator `brand/generate.mjs`) | Only used to regenerate favicons on a developer machine. libvips is dynamically linked and never distributed with Peerly. No obligation. |
| argparse@2.0.1 | Web dev (via eslint → js-yaml) | Python-2.0 | eslint | Permissive. |
| caniuse-lite | Web build | CC-BY-4.0 | browserslist (Babel, in the router plugin) | Browser-support data used at build time. Attribution travels with the package. |
| isbot@5.2.2 | Web runtime (SSR) | Unlicense | @tanstack/react-router | Public-domain dedication. |
| big-integer@1.6.52 | API runtime | Unlicense | exceljs → unzipper | Public-domain dedication. |
| tslib@2.8.1 | Web runtime | 0BSD | several | Permissive. |
| minimatch@10.2.6 | Web dev | BlueOak-1.0.0 | tooling | Permissive. |
| chainsaw, traverse | API runtime | "MIT/X11" | exceljs → unzipper → binary | MIT. |
| pako | API runtime | MIT AND Zlib | exceljs → jszip | Permissive. |

**No GPL, AGPL or SSPL licence applies to anything Peerly distributes or runs**, and nothing is marked `UNLICENSED`. The one `UNKNOWN` is `buffers`.

---

## Brand assets, images and fonts

| Asset | Source | Status |
| --- | --- | --- |
| `brand/favicon.svg`, `brand/mark.svg`, `brand/mark-small.svg`, `brand/og.svg` | Created for Peerly by the project team | Project-owned. Covered by whatever terms apply to the Peerly source (see item 3 in the conclusion). |
| `public/favicon.*`, `public/icon-*.png`, `public/apple-touch-icon.png`, `public/og-image.png`, `public/site.webmanifest` | Generated from the SVGs above by `node brand/generate.mjs` | Project-owned, as above. |
| `public/nwu-logo-white.png` (shown on the sign-in and welcome screens) | North-West University logo, from `Content/NWU-Logo-SWFooter.png` | NWU trademark. Its use in an NWU system is at the university's discretion. **TODO (Sponsor): confirm that the brand office approves using the logo on this system.** |
| `public/students-on-campus.jpg` (welcome-page background) | From `Content/roleseelctionimage1.jpg`, supplied with the Sponsor's content | **Provenance not recorded.** The file carries no copyright or credit metadata. **TODO (Sponsor): confirm the university owns this photograph or holds a licence for it, and get consent from any identifiable people in it. If neither can be confirmed, replace it.** The page works without it: set `WELCOME_BACKGROUND` in `src/routes/index.tsx` to `null`. |
| `Content/*` (other images: `NWU-1.jpg`, `lecturerhall.png`, `roleselectionimage2.jpg`) | Sponsor-supplied | These are in the repository but **not bundled** into the build. Confirm provenance as above before any of them is used. |
| Fonts | None bundled | `src/styles.css` asks for `Inter, ui-sans-serif, system-ui, sans-serif` by name only. No font files are shipped and no web-font service (such as Google Fonts) is contacted. Users who have Inter installed see it, and everyone else gets the system font. There is no font licence obligation. |
| Icons | `lucide-react` (ISC) | Listed above. |

---

## Keeping this register current

- Update this file in the same pull request that adds, removes or upgrades a dependency.
- Before accepting a new dependency, check its licence. Anything GPL, AGPL, LGPL (other than a dynamically linked dev tool), SSPL, "Commons Clause", non-commercial Creative Commons, or with no licence at all needs sign-off from the university before it is merged.
- Re-run the scan commands at the top of this page before each release.
