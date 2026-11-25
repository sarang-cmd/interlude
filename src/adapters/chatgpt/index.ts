import selectors from "./selectors.json";
import { StructuralAdapter, type StructuralSelectors } from "../structural";
import type { SitePlugin } from "../types";
export class ChatGPTAdapter extends StructuralAdapter {
  constructor(overrides: Partial<StructuralSelectors> = {}) {
    super({ id: "chatgpt", displayName: "ChatGPT", hosts: ["chatgpt.com"], selectors }, overrides);
  }
}
const plugin: SitePlugin = {
  id: "chatgpt",
  implemented: true,
  selectorOverrideKey: "interlude.chatgptSelectors",
  matches: (url) => new ChatGPTAdapter().matches(url),
  create: (configuration) =>
    new ChatGPTAdapter((configuration ?? {}) as Partial<StructuralSelectors>),
};
export default plugin;
