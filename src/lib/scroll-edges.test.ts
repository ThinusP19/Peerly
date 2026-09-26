import { describe, expect, it } from "vitest";

import { scrollEdges } from "./scroll-edges";

describe("scrollEdges", () => {
  it("says nothing is hidden when the table fits", () => {
    expect(scrollEdges({ scrollLeft: 0, scrollWidth: 366, clientWidth: 366 })).toEqual({
      left: false,
      right: false,
    });
    // A sub-pixel overflow is rounding, not a hidden column.
    expect(scrollEdges({ scrollLeft: 0, scrollWidth: 366.6, clientWidth: 366 })).toEqual({
      left: false,
      right: false,
    });
  });

  it("points right while columns sit off-screen to the right", () => {
    // The marks table on a 390px phone: 527 wide in a 366 box.
    expect(scrollEdges({ scrollLeft: 0, scrollWidth: 527, clientWidth: 366 })).toEqual({
      left: false,
      right: true,
    });
  });

  it("points both ways part-way through, and only left at the end", () => {
    expect(scrollEdges({ scrollLeft: 80, scrollWidth: 527, clientWidth: 366 })).toEqual({
      left: true,
      right: true,
    });
    expect(scrollEdges({ scrollLeft: 161, scrollWidth: 527, clientWidth: 366 })).toEqual({
      left: true,
      right: false,
    });
    // Fractional positions a pixel short of the end still count as the end.
    expect(scrollEdges({ scrollLeft: 160.5, scrollWidth: 527, clientWidth: 366 })).toEqual({
      left: true,
      right: false,
    });
  });
});
