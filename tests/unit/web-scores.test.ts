import { describe, expect, it } from "vitest";
import { readWebScores, saveWebScore, WEB_SCORES_KEY } from "../../src/web/scores";

function storage(initial = "{}"): Pick<Storage, "getItem" | "setItem"> {
  let value = initial;
  return {
    getItem: (key) => (key === WEB_SCORES_KEY ? value : null),
    setItem: (key, next) => {
      if (key === WEB_SCORES_KEY) value = next;
    },
  };
}

describe("website-only scores", () => {
  it("retains per-game bests, never lowers a record, and survives reload", () => {
    const store = storage();
    const scores = readWebScores(store);
    saveWebScore(store, scores, "snake", 40);
    saveWebScore(store, scores, "snake", 10);
    saveWebScore(store, scores, "pong", 25);
    expect({ ...readWebScores(store) }).toEqual({ snake: 40, pong: 25 });
  });

  it("merges a record written by another tab before saving", () => {
    const store = storage();
    const first = readWebScores(store);
    const second = readWebScores(store);
    saveWebScore(store, first, "snake", 40);
    saveWebScore(store, second, "pong", 25);
    expect({ ...readWebScores(store) }).toEqual({ snake: 40, pong: 25 });
  });

  it("ignores corrupt, non-finite, negative or suspicious stored values", () => {
    expect({ ...readWebScores(storage("{")) }).toEqual({});
    expect({ ...readWebScores(storage("[]")) }).toEqual({});
    expect({
      ...readWebScores(storage('{"snake":42,"bad value":5,"pong":-7,"flappy":"100"}')),
    }).toEqual({ snake: 42 });
  });

  it("keeps an in-memory score if browser storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const scores = readWebScores(blocked);
    saveWebScore(blocked, scores, "dashline", 19);
    expect(scores.dashline).toBe(19);
  });
});
