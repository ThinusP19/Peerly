import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Hero } from "./Hero";

const stat = (label: string) => ({ label, value: 3, detail: "detail" });

describe("Hero stat tiles", () => {
  it("wrap long labels instead of cutting them off", () => {
    // On a phone the detail line is hidden, so a label cut to
    // "AWAITING ACTIVATI..." would leave nothing to read.
    const html = renderToStaticMarkup(
      <Hero
        eyebrow="Admin"
        title="Dashboard"
        subtitle="Accounts"
        stats={[stat("Lecturer accounts"), stat("Awaiting activation")]}
      />,
    );
    const labels = [...html.matchAll(/<dt class="([^"]*)"/g)].map((match) => match[1]);
    expect(labels).toHaveLength(2);
    for (const className of labels) expect(className.split(" ")).not.toContain("truncate");
  });

  it("stack three tiles on the narrowest phones rather than squeeze them", () => {
    const html = renderToStaticMarkup(
      <Hero
        eyebrow="Student"
        title="Dashboard"
        subtitle="Assessments"
        stats={[stat("Submitted"), stat("Coming up"), stat("Closed")]}
      />,
    );
    expect(html).toMatch(/<dl class="[^"]*\bgrid-cols-1\b[^"]*min-\[360px\]:grid-cols-3/);
  });
});
