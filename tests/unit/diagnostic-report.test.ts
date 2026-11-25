import { describe, expect, it } from "vitest";
import { cleanReport, type LiveDiagnostics } from "../../src/diagnostics/report";

describe("shareable diagnostic report", () => {
  it("allowlists only version, browser, adapter and structural results, never page data or arbitrary details", () => {
    const secret = "SECRET_CHAT_AND_ACCOUNT_9481";
    const data = {
      adapterId: "gemini",
      url: `https://gemini.google.com/chat/${secret}`,
      state: "generating",
      generating: true,
      reasons: [secret],
      selectorSource: "LOCAL OVERRIDE",
      theme: "dark",
      signals: {
        a: { active: true, detail: secret },
        b: { active: false, matchedSelector: secret },
        c: { active: true },
        d: { active: false },
      },
      selectors: [
        {
          element: "stopControl",
          candidates: [secret, secret],
          matchedSelector: secret,
          matchedIndex: 1,
        },
        { element: secret, candidates: [secret], matchedIndex: 0 },
      ],
      mount: { found: true, placement: "inline", detail: secret },
      lastSignalToFrameMs: 30.7,
      timeline: [
        { phase: "generating", timestamp: 1700000000000 },
        { phase: secret, timestamp: 123 },
      ],
      panel: { visible: true, scene: "playing", gameId: "snake", error: secret, overheadMs: 5 },
    } as unknown as LiveDiagnostics;
    const report = cleanReport(
      "0.2.0",
      `Mozilla/${secret} Chrome/131.0.1 Safari/${secret}`,
      data,
      { result: secret, lastCheck: 1700000000000 },
      { result: "CHECKED", lastCheck: 1700000000000 },
    );
    expect(report).not.toContain(secret);
    expect(report).not.toContain("https://gemini.google.com");
    expect(report).toContain("Extension: 0.2.0");
    expect(report).toContain("Browser: Chromium 131.0.1");
    expect(report).toContain("Adapter: gemini");
    expect(report).toContain("stopControl: #2 / 2");
    expect(report).toContain("Host theme: dark");
    expect(report).toContain("generating @ 1700000000000");
    expect(report).toContain("Signed selector check: unknown");
  });
  it("still creates a clean report without a supported tab", () => {
    expect(cleanReport("0.2.0", "", null, null, null)).toContain(
      "Adapter: no responding supported tab",
    );
  });
});
