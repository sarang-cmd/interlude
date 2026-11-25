/**
 * Selector Fallback Resolver.
 *
 * Every element the adapters need is described by an ordered list of CSS
 * candidates (preferred first). This resolver takes an injectable query
 * function so it is unit-testable without a DOM.
 *
 * Diagnostics surface exposes which candidate matched, which is how a human
 * fixes selectors against the live site in minutes instead of guessing.
 */

export type QueryFn = (selector: string) => Element | null;

export interface ResolveResult {
  /** The element that matched, or null if nothing did. */
  element: Element | null;
  /** Index into the candidates array, or -1 if none matched. */
  matchedIndex: number;
  /** The selector string that matched, or null. */
  matchedSelector: string | null;
  /** All candidates tried, in order. */
  candidates: string[];
}

/**
 * Try candidates in order against `query`. Returns the first match.
 * Never throws — a dead selector should degrade to "no match", not break the page.
 */
export function resolveFirst(candidates: string[], query: QueryFn): ResolveResult {
  for (let i = 0; i < candidates.length; i++) {
    const selector = candidates[i] as string;
    try {
      const element = query(selector);
      if (element) {
        return { element, matchedIndex: i, matchedSelector: selector, candidates: [...candidates] };
      }
    } catch {
      // Invalid/unsupported selector in this browser — treat as no match.
      continue;
    }
  }
  return { element: null, matchedIndex: -1, matchedSelector: null, candidates: [...candidates] };
}

/** Query-all variant for multi-match fallbacks (e.g. candidate turn lists). */
export function resolveAll(
  candidates: string[],
  queryAll: (selector: string) => Element[],
): {
  elements: Element[];
  matchedIndex: number;
  matchedSelector: string | null;
  candidates: string[];
} {
  for (let i = 0; i < candidates.length; i++) {
    const selector = candidates[i] as string;
    try {
      const elements = queryAll(selector);
      if (elements.length > 0) {
        return {
          elements,
          matchedIndex: i,
          matchedSelector: selector,
          candidates: [...candidates],
        };
      }
    } catch {
      continue;
    }
  }
  return { elements: [], matchedIndex: -1, matchedSelector: null, candidates: [...candidates] };
}

/**
 * Select the last distinct outer element across all candidates in document
 * order. Unlike a single fallback query, this handles a conversation containing
 * older and newer markup simultaneously. Nested matches represent the same
 * turn; keep their outer matched ancestor. The caller can filter inactive
 * branches in `queryAll`. Diagnostics identify the selected element's earliest
 * matching candidate.
 */
export function resolveLatest(
  candidates: string[],
  queryAll: (selector: string) => Element[],
): ResolveResult {
  const matches = new Map<Element, number>();
  for (let i = 0; i < candidates.length; i++) {
    try {
      for (const element of queryAll(candidates[i]!)) {
        if (!matches.has(element)) matches.set(element, i);
      }
    } catch {
      // Invalid candidates do not prevent other markup from being discovered.
    }
  }
  let latest: Element | null = null;
  for (const element of matches.keys()) {
    let ancestor = element.parentElement;
    while (ancestor && !matches.has(ancestor)) ancestor = ancestor.parentElement;
    if (ancestor) continue;
    if (
      !latest ||
      (latest.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    )
      latest = element;
  }
  const matchedIndex = latest ? (matches.get(latest) ?? -1) : -1;
  return {
    element: latest,
    matchedIndex,
    matchedSelector: matchedIndex < 0 ? null : candidates[matchedIndex]!,
    candidates: [...candidates],
  };
}
