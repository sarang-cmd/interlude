import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const tag = process.argv[2];
if (!tag || !/^v(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(tag))
  throw new Error("Usage: npm run package:release -- vX.Y.Z");
const version = tag.slice(1);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
if (pkg.version !== version || manifest.version !== version)
  throw new Error("Tag, package.json and built manifest versions must match exactly");
if (!existsSync("dist/background.js") || !existsSync("dist/options.html"))
  throw new Error("Build is incomplete; run npm run build first");
const output = resolve("release");
mkdirSync(output, { recursive: true });
const versioned = `interlude-${tag}.zip`,
  latest = "interlude-latest.zip";
rmSync(resolve(output, versioned), { force: true });
execFileSync("zip", ["-q", "-r", resolve(output, versioned), "."], { cwd: resolve("dist") });
copyFileSync(resolve(output, versioned), resolve(output, latest));
const checksum = (file) =>
  `${createHash("sha256")
    .update(readFileSync(resolve(output, file)))
    .digest("hex")}  ${file}`;
writeFileSync(resolve(output, "SHA256SUMS.txt"), `${checksum(versioned)}\n${checksum(latest)}\n`);
console.log(`Created ${versioned}, ${latest}, and SHA256SUMS.txt in release/.`);
