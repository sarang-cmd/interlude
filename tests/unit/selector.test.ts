import { describe, expect, it } from "vitest";
import { resolveAll, resolveFirst } from "../../src/adapters/selectorResolver";

describe("selector fallbacks", () => {
  it("tries candidates in order, skips invalid syntax, and reports the matched candidate", () => {
    const marker = {} as Element;
    const tried: string[] = [];
    const result = resolveFirst(["invalid", "preferred", "fallback"], (selector) => {
      tried.push(selector);
      if (selector === "invalid") throw new Error("bad selector");
      return selector === "fallback" ? marker : null;
    });
    expect(result.element).toBe(marker);
    expect(result.matchedIndex).toBe(2);
    expect(result.matchedSelector).toBe("fallback");
    expect(tried).toEqual(["invalid", "preferred", "fallback"]);
  });
  it("returns all elements from only the first successful candidate", () => {
    const a = {} as Element,
      b = {} as Element;
    const result = resolveAll(["none", "match", "later"], (selector) =>
      selector === "match" ? [a, b] : [],
    );
    expect(result.elements).toEqual([a, b]);
    expect(result.matchedIndex).toBe(1);
    expect(resolveFirst(["missing"], () => null).matchedIndex).toBe(-1);
  });
});
