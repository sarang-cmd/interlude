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
      const samples = [
        "const x = message.textContent;", "const x = message.textContent.length;",
        "const x = message['innerText'];", "const x = message['text' + 'Content'];",
        "const x = message[`outerHTML`];", "const { nodeValue } = message;",
        "const { ['innerText']: words } = message;", "const x = message.value;",
        "const x = message.data;", "const x = message.getAttribute('title');",
      ];
      samples.forEach((source, index) => writeFileSync(join(dir, `bad-${index}.ts`), source));
      const result = spawnSync("node", ["scripts/check-adapter-privacy.mjs", dir], { encoding: "utf8" });
      expect(result.status).toBe(1);
      samples.forEach((_, index) => expect(result.stderr).toContain(`bad-${index}.ts:`));
      writeFileSync(join(dir, "structural.ts"), "const hasChildren = message.childNodes.length > 0; const roleMatch = message.matches(selector);");
      expect(spawnSync("node", ["scripts/check-adapter-privacy.mjs", join(dir, "structural.ts")]).status).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
