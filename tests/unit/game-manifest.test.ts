import { describe, expect, it } from "vitest";
import { GAME_IDS, playerOneBindings } from "../../src/games/catalog";
import {
  availableModes,
  GAME_MANIFESTS,
  getManifest,
  loadGame,
  sharedModesFor,
} from "../../src/games/manifest";
import { PLATFORM } from "../../src/platform";
import { SETTINGS_BY_ID } from "../../src/settings/schema";
import { localModesFor } from "../../src/twoplayer/registry";

describe("game metadata and surface modes", () => {
  it("has complete metadata and the same player-one defaults as settings", () => {
    expect(GAME_MANIFESTS.map((entry) => entry.id)).toEqual([...GAME_IDS]);
    expect(new Set(GAME_MANIFESTS.map((entry) => entry.id)).size).toBe(GAME_IDS.length);
    for (const [index, manifest] of GAME_MANIFESTS.entries()) {
      expect(manifest.category).toBeTruthy();
      expect(manifest.runLength).toBeTruthy();
      expect(manifest.inputs).toContain("keyboard");
      expect(manifest.inputs).toEqual(manifest.supports);
      expect(manifest.surfaces).toEqual(["extension", "web"]);
      expect(manifest.playerOneBindings).toEqual(playerOneBindings(GAME_IDS[index]!));
      expect(typeof manifest.stateSaving).toBe("boolean");
      expect(typeof manifest.ai.opponent).toBe("boolean");
      expect(typeof manifest.ai.watchable).toBe("boolean");
      for (const [action, code] of Object.entries(manifest.playerOneBindings)) {
        expect(SETTINGS_BY_ID.get(`key.${manifest.id}.${action}`)?.default).toBe(code);
      }
      for (const surface of manifest.surfaces) {
        const modes = sharedModesFor(manifest.id, surface);
        expect(modes.length).toBeGreaterThan(0);
        for (const mode of modes) {
          expect(mode.description).toBeTruthy();
          expect(mode.players === 0 || mode.players === 1).toBe(true);
          expect(mode.surfaces).toContain(surface);
        }
      }
    }
  });

  it("advertises only implemented modes and rejects a web-only request in the extension", async () => {
    expect(PLATFORM).toBe("extension");
    expect(await availableModes("pong")).toEqual(sharedModesFor("pong", "extension"));
    expect((await availableModes("pong")).map((mode) => mode.id)).toEqual(["cpu", "watch"]);
    expect((await availableModes("tictactoe")).map((mode) => mode.id)).toEqual(["cpu", "watch"]);
    expect(localModesFor("tictactoe").map((mode) => mode.id)).toEqual(["local"]);
    expect(localModesFor("pong").map((mode) => mode.id)).toEqual(["local"]);
    for (const id of GAME_IDS) {
      expect(localModesFor(id).map((mode) => mode.id)).toEqual(
        id === "twenty48" ? ["local", "coop"] : id === "darkroom" ? [] : ["local"],
      );
      await expect(loadGame(id, "local")).rejects.toThrow("Mode unavailable");
    }
    await expect(loadGame("twenty48", "coop")).rejects.toThrow("Mode unavailable");
    expect(localModesFor("missing")).toEqual([]);
    await expect(loadGame("pong", "local")).rejects.toThrow("Mode unavailable");
    await expect(loadGame("missing")).rejects.toThrow("Unknown game");
    expect(sharedModesFor("missing", "web")).toEqual([]);
    expect(getManifest("missing")).toBeUndefined();
  });
});
