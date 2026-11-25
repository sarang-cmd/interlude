import { InactiveAdapter } from "../unavailable";
/** Interface only. Gemini detection is intentionally not enabled. */
export const geminiAdapter = new InactiveAdapter("gemini", "Gemini", ["gemini.google.com"]);
