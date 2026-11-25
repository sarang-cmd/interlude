import { InactiveAdapter } from "../unavailable";
/** Interface only. ChatGPT detection is intentionally not enabled. */
export const chatgptAdapter = new InactiveAdapter("chatgpt", "ChatGPT", ["chatgpt.com", "chat.openai.com"]);
