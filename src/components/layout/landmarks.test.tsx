import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthShell } from "@/components/layout/AuthShell";
import { MAIN_CONTENT_ID } from "@/components/layout/SkipLink";
import { NotFoundPage } from "@/components/shared/NotFoundPage";

// Screen-reader users jump between landmarks. The sign-in, registration and
// password pages, and the 404, sit outside both portal shells, so they need
// their own.
describe("pages outside the portals", () => {
  it("put the auth form in a <main> the skip link can reach", () => {
    const html = renderToStaticMarkup(
      <AuthShell title="Student sign in">
        <form />
      </AuthShell>,
    );
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain(`<main id="${MAIN_CONTENT_ID}" tabindex="-1"`);
    expect(html).toContain(`href="#${MAIN_CONTENT_ID}"`);
    expect(html).toContain("Skip to main content");
    // The heading sits inside the landmark.
    expect(html.indexOf("<main")).toBeLessThan(html.indexOf("Student sign in"));
  });

  it("give the 404 page a <main> and a heading that says what happened", () => {
    const html = renderToStaticMarkup(<NotFoundPage />);
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Page not found<\/h1>/);
    expect(html).not.toMatch(/<h1[^>]*>404<\/h1>/);
  });
});
