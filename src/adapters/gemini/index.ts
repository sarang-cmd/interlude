import { InactiveAdapter } from "../unavailable";
import type { SitePlugin } from "../types";
const make = () => new InactiveAdapter("gemini", "Gemini", ["gemini.google.com"]);
/** Interface only. Gemini detection is intentionally not enabled. */
const plugin: SitePlugin = {
  id: "gemini",
  implemented: false,
  matches: (url) => make().matches(url),
  create: make,
};
export default plugin;
