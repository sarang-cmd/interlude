import { InactiveAdapter } from "../unavailable";
import type { SitePlugin } from "../types";
const make = () => new InactiveAdapter("chatgpt", "ChatGPT", ["chatgpt.com", "chat.openai.com"]);
/** Interface only. ChatGPT detection is intentionally not enabled. */
const plugin: SitePlugin = { id: "chatgpt", implemented: false, matches: (url) => make().matches(url), create: make };
export default plugin;
