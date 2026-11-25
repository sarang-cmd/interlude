import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("adapter privacy guard", () => {
  it("passes the shipped adapters", () => { expect(execFileSync("node", ["scripts/check-adapter-privacy.mjs"], { encoding: "utf8" })).toContain("passed"); });
  it("fails on direct, computed and destructured content access", () => {
    const dir = mkdtempSync(join(tmpdir(), "interlude-privacy-"));
    try {
      for (const source of ["const x = message.textContent;", "const x = message['innerText'];", "const { nodeValue } = message;"]) {
        const file = join(dir, "bad.ts"); writeFileSync(file, source);
        expect(spawnSync("node", ["scripts/check-adapter-privacy.mjs", file]).status).toBe(1);
      }
      writeFileSync(join(dir, "structural.ts"), "const hasChildren = message.childNodes.length > 0;");
      expect(spawnSync("node", ["scripts/check-adapter-privacy.mjs", join(dir, "structural.ts")]).status).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
