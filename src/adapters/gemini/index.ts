import selectors from "./selectors.json";
import { StructuralAdapter, type StructuralSelectors } from "../structural";
import type { SitePlugin } from "../types";
export class GeminiAdapter extends StructuralAdapter {
  constructor(overrides: Partial<StructuralSelectors> = {}) {
    super(
      { id: "gemini", displayName: "Gemini", hosts: ["gemini.google.com"], selectors },
      overrides,
    );
  }
}
const plugin: SitePlugin = {
  id: "gemini",
  implemented: true,
  selectorOverrideKey: "interlude.geminiSelectors",
  matches: (url) => new GeminiAdapter().matches(url),
  create: (configuration) =>
    new GeminiAdapter((configuration ?? {}) as Partial<StructuralSelectors>),
};
export default plugin;
