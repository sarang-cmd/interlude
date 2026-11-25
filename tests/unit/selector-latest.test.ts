// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { resolveLatest } from "../../src/adapters/selectorResolver";

afterEach(() => document.body.replaceChildren());

describe("latest active turn selection", () => {
  const selectors = ["[", "[data-old]", "[data-message]", "[data-stream]"];
  const query = (selector: string): Element[] =>
    Array.from(document.querySelectorAll(selector)).filter(
      (element) => !element.closest("[hidden]"),
    );

  it("chooses the latest turn across candidate types and ignores nested duplicates and hidden branches", () => {
    document.body.innerHTML = `
      <article data-old></article>
      <article data-message><div data-stream></div></article>
      <article data-old hidden></article>`;
    const result = resolveLatest(selectors, query);
    expect(result.element).toBe(document.querySelector("[data-message]"));
    expect(result.matchedIndex).toBe(2);
    expect(result.matchedSelector).toBe("[data-message]");
    expect(result.candidates).toEqual(selectors);
  });

  it("uses the outermost turn even if its nested match is an earlier candidate", () => {
    document.body.innerHTML = `<article data-message><div data-old></div></article>`;
    const result = resolveLatest(selectors, query);
    expect(result.element).toBe(document.querySelector("[data-message]"));
    expect(result.matchedIndex).toBe(2);
  });

  it("reports the earliest selector matching the selected element and handles no match", () => {
    document.body.innerHTML = `<article data-old data-message></article>`;
    const result = resolveLatest(selectors, query);
    expect(result.matchedIndex).toBe(1);
    expect(result.matchedSelector).toBe("[data-old]");
    document.body.replaceChildren();
    expect(resolveLatest(selectors, query)).toMatchObject({
      element: null,
      matchedIndex: -1,
      matchedSelector: null,
    });
  });
});
