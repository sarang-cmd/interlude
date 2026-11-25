import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
const filename = process.argv[2];
if (!filename)
  throw new Error("Usage: npx tsx scripts/generate-selector-key.ts /secure/path/private.pem");
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
writeFileSync(filename, privateKey.export({ type: "pkcs8", format: "pem" }), {
  mode: 0o600,
  flag: "wx",
});
console.log("Replace SELECTOR_PUBLIC_KEY in src/updates/publicKey.ts with:");
console.log(publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("base64"));
console.log("Keep the private key offline and out of the repository.");
