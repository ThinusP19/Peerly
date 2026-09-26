import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { pageTitle, titleHead } from "./page-title";

describe("pageTitle", () => {
  it("names the page first and the product last", () => {
    expect(pageTitle("Results")).toBe("Results - Peerly");
    expect(pageTitle("Student sign in")).toBe("Student sign in - Peerly");
  });

  it("drops empty parts instead of leaving stray separators", () => {
    expect(pageTitle()).toBe("Peerly");
    expect(pageTitle(undefined, "  ", "Groups")).toBe("Groups - Peerly");
  });

  it("gives a route head with just the title", () => {
    expect(titleHead("Audit log")).toEqual({ meta: [{ title: "Audit log - Peerly" }] });
  });
});

const routesDir = join(__dirname, "..", "routes");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

// Layout routes (route.tsx) and the root only wrap pages; the page inside
// always names itself.
const pages = routeFiles(routesDir).filter(
  (path) => !path.endsWith("__root.tsx") && !path.endsWith("route.tsx"),
);

describe("every page has its own document title", () => {
  it.each(pages.map((path) => [relative(routesDir, path), path]))("%s sets one", (_, path) => {
    expect(readFileSync(path, "utf8")).toMatch(/head:\s*\([^)]*\)\s*=>\s*titleHead\(/);
  });

  it("no two pages in the same portal share a title", () => {
    const seen = new Map<string, string>();
    for (const path of pages) {
      const name = relative(routesDir, path);
      const portal = name.includes("/") ? name.split("/")[0] : "auth";
      const literal = /titleHead\("([^"]+)"/.exec(readFileSync(path, "utf8"))?.[1];
      if (!literal) continue;
      const key = `${portal}:${literal}`;
      expect(seen.get(key), `${name} repeats the title of ${seen.get(key)}`).toBeUndefined();
      seen.set(key, name);
    }
  });
});
