// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { Input } from "../../src/engine/input";
import { loadHighScores, saveHighScore } from "../../src/shared/storage";

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
it("keyboard input is focus-gated, buffered and remappable", () => {
  const target = document.createElement("canvas"); document.body.append(target);
  const input = new Input(); input.attach(target, (x, y) => ({ x, y }));
  const disabled = new KeyboardEvent("keydown", { code: "ArrowLeft", bubbles: true, cancelable: true });
  target.dispatchEvent(disabled); expect(disabled.defaultPrevented).toBe(false); expect(input.isDown("left")).toBe(false);
  input.setEnabled(true); input.setKeymapOverrides({ primary: "KeyQ" });
  const mapped = new KeyboardEvent("keydown", { code: "KeyQ", bubbles: true, cancelable: true });
  target.dispatchEvent(mapped); expect(mapped.defaultPrevented).toBe(true); expect(input.isDown("primary")).toBe(true);
  expect(input.wasPressedWithin("primary", 100, true)).toBe(true); expect(input.wasPressedWithin("primary", 100, true)).toBe(false);
  input.setEnabled(false); expect(input.isDown("primary")).toBe(false); input.detach();
});
it("standard gamepad buttons and axes become buffered actions only while enabled", () => {
  const input = new Input();
  const pad = { connected: true, axes: [-0.8, 0], buttons: [{ pressed: true }] } as unknown as Gamepad;
  vi.stubGlobal("navigator", { getGamepads: () => [pad] });
  input.pollGamepads(); expect(input.isDown("left")).toBe(false);
  input.setEnabled(true); input.pollGamepads();
  expect(input.isDown("left")).toBe(true); expect(input.wasPressedWithin("primary", 100, true)).toBe(true);
  input.setEnabled(false); expect(input.isDown("left")).toBe(false);
});
it("the high-score store never replaces a personal best with a lower score", async () => {
  await saveHighScore("test-score", 20); await saveHighScore("test-score", 10);
  expect((await loadHighScores())["test-score"]).toBe(20);
  expect(await saveHighScore("test-score", 30)).toEqual({ best: 30, isRecord: true });
});

it("serializes concurrent score writes without discarding another cabinet", async () => {
  const store: Record<string, unknown> = {};
  vi.stubGlobal("chrome", { storage: { local: {
    get: async (key: string) => ({ [key]: structuredClone(store[key]) }),
    set: async (values: Record<string, unknown>) => { Object.assign(store, structuredClone(values)); },
  } } });
  await Promise.all([saveHighScore("snake", 30), saveHighScore("pong", 50), saveHighScore("snake", 20)]);
  expect(await loadHighScores()).toEqual({ snake: 30, pong: 50 });
});
