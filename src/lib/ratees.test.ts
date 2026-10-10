import { describe, expect, it } from "vitest";

import { rateesFor } from "./ratees";

const me = { id: "me", name: "Lerato", surname: "Mokoena" };
const peers = [
  { id: "a", name: "Ana", surname: "Smit" },
  { id: "b", name: "Ben", surname: "Nel" },
];

describe("rateesFor", () => {
  it("puts the student first, marked as themselves", () => {
    const ratees = rateesFor(peers, me);
    expect(ratees.map((r) => [r.id, r.isSelf])).toEqual([
      ["me", true],
      ["a", false],
      ["b", false],
    ]);
  });

  it("never lists the student twice", () => {
    expect(rateesFor([...peers, me], me).filter((r) => r.id === "me")).toHaveLength(1);
  });

  it("asks for no self-rating in a group of one, where there is nothing to rate", () => {
    expect(rateesFor([], me)).toEqual([]);
  });
});
