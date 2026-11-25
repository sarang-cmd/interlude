/**
 * Interlude design tokens as TypeScript constants.
 * Keep in sync with design/tokens.css.
 */
export const TOKENS = {
  ink: "#0E0B07",
  ink2: "#171209",
  ink3: "#221A10",
  phosphor: "#FFB000",
  phosphorDim: "#7A5600",
  phosphorHot: "#FFD36B",
  phosphorFaint: "rgba(255, 176, 0, 0.14)",
  paper: "#E9DFC8",
  paperInk: "#2A2118",
  signalRed: "#D6452B",
  signalGreen: "#5FBF6A",
  panelWidth: 640,
  panelHeight: 360,
} as const;

export const FONT_DISPLAY = '"Silkscreen", "VT323", monospace';
export const FONT_CRT = '"VT323", "IBM Plex Mono", monospace';
export const FONT_BODY = '"IBM Plex Mono", ui-monospace, monospace';

/** Canvas logical size every game renders at. */
export const LOGICAL_WIDTH = 640;
export const LOGICAL_HEIGHT = 360;
