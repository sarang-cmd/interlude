// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/shared/storage";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
it("the pre-mounted idle cabinet schedules no frames, timers or active observers", async () => {
  vi.useFakeTimers();
  const frame = vi.fn(() => 1);
  vi.stubGlobal("requestAnimationFrame", frame);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("chrome", {
    runtime: { getURL: (value: string) => `chrome-extension://local/${value}` },
  });
  const context = {
    fillRect: vi.fn(),
    createPattern: vi.fn(() => null),
    imageSmoothingEnabled: false,
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context as never);
  document.body.innerHTML =
    '<main><div data-testid="assistant-turn"></div><form data-testid="chat-composer"><textarea data-testid="chat-input"></textarea><button data-testid="send-button"></button></form></main>';
  const { InterludeController } = await import("../../src/content/controller");
  const { ClaudeAdapter } = await import("../../src/adapters/claude/adapter");
  const controller = new InterludeController({ ...DEFAULT_SETTINGS }, new ClaudeAdapter());
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(frame).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  expect(controller.diagnostics().activity).toEqual({
    observers: 0,
    timers: 0,
    scheduledFrames: 0,
  });
  expect(controller.diagnostics().panel.loopRunning).toBe(false);
  expect((controller.panel.host as HTMLElement).style.display).toBe("none");
  controller.destroy();
});
