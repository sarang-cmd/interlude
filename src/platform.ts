/** Replaced with a literal by each Vite build. Never choose a surface at runtime. */
export type Platform = "extension" | "web";

declare global {
  const __PLATFORM__: Platform;
}

export const PLATFORM: Platform = __PLATFORM__;
