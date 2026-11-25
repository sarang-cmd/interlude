import { ClaudeAdapter, SELECTOR_OVERRIDE_KEY, type ClaudeSelectors } from "./adapter";
import type { SitePlugin } from "../types";
const plugin: SitePlugin = {
  id: "claude",
  implemented: true,
  selectorOverrideKey: SELECTOR_OVERRIDE_KEY,
  matches(url) { return new ClaudeAdapter().matches(url); },
  create(configuration) { return new ClaudeAdapter((configuration ?? {}) as Partial<ClaudeSelectors>); },
};
export default plugin;
