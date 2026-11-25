// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { Sound } from "../../src/engine/sound";

afterEach(() => vi.unstubAllGlobals());
it("mute never opens an audio graph and closes an existing graph", () => {
  const close = vi.fn(async () => {});
  const made = vi.fn();
  class FakeAudioContext {
    state = "running";
    destination = {};
    constructor() {
      made();
    }
    createGain() {
      return { gain: { value: 0 }, connect() {} };
    }
    close() {
      return close();
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  const sound = new Sound();
  sound.setMuted(true);
  sound.unlock();
  expect(made).not.toHaveBeenCalled();
  sound.setMuted(false);
  sound.unlock();
  expect(made).toHaveBeenCalledTimes(1);
  sound.setMuted(true);
  expect(close).toHaveBeenCalledTimes(1);
  sound.unlock();
  expect(made).toHaveBeenCalledTimes(1);
});
