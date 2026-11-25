import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

it("packages only a matching built version, names both archives and writes verifiable checksums", () => {
  const dir = mkdtempSync(join(tmpdir(), "interlude-release-"));
  try {
    mkdirSync(join(dir, "dist"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1.2.3" }));
    writeFileSync(join(dir, "dist/manifest.json"), JSON.stringify({ version: "1.2.3" }));
    writeFileSync(join(dir, "dist/background.js"), "// worker");
    writeFileSync(join(dir, "dist/options.html"), "<!doctype html>");
    const script = resolve("scripts/package-release.mjs");
    expect(spawnSync("node", [script, "v1.2.4"], { cwd: dir }).status).not.toBe(0);
    expect(spawnSync("node", [script, "v1.2.3;bad"], { cwd: dir }).status).not.toBe(0);
    const result = spawnSync("node", [script, "v1.2.3"], { cwd: dir, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const first = readFileSync(join(dir, "release/interlude-v1.2.3.zip"));
    const second = readFileSync(join(dir, "release/interlude-latest.zip"));
    expect(first.equals(second)).toBe(true);
    const hash = createHash("sha256").update(first).digest("hex");
    const sums = readFileSync(join(dir, "release/SHA256SUMS.txt"), "utf8");
    expect(sums).toContain(`${hash}  interlude-v1.2.3.zip`);
    expect(sums).toContain(`${hash}  interlude-latest.zip`);
    expect(spawnSync("unzip", ["-t", join(dir, "release/interlude-v1.2.3.zip")]).status).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
