import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RatingOptionList } from "./RatingOptionList";

describe("RatingOptionList (BR-15)", () => {
  const options = [
    { id: "ro-1", label: "Excellent", description: "Led the work.", order: 1 },
    { id: "ro-9", label: "No contribution", description: "Did nothing.", order: 9 },
  ];

  it("lists the options in words, strongest first", () => {
    const html = renderToStaticMarkup(<RatingOptionList options={options} />);
    expect(html.indexOf("Excellent")).toBeLessThan(html.indexOf("No contribution"));
  });

  it("shows no number beside an option, so it does not read as a scale", () => {
    const html = renderToStaticMarkup(<RatingOptionList options={options} />);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\d/);
  });
});
