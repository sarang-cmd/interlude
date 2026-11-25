import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJSON, validSelectorPayload } from "../src/updates/selectors";
import { SELECTOR_PUBLIC_KEY } from "../src/updates/publicKey";

const [input, keyPath, output] = process.argv.slice(2);
if (!input || !keyPath || !output)
  throw new Error("Usage: npm run sign:selectors -- payload.json private-key.pem signed.json");
const payload: unknown = JSON.parse(readFileSync(input, "utf8"));
if (!validSelectorPayload(payload)) throw new Error("Invalid selector payload; do not sign it");
const privateKey = createPrivateKey(readFileSync(keyPath));
const publicKey = createPublicKey(privateKey)
  .export({ type: "spki", format: "der" })
  .subarray(-32)
  .toString("base64");
if (publicKey !== SELECTOR_PUBLIC_KEY)
  throw new Error("Private key does not match the public key bundled in this build");
const signature = sign(null, Buffer.from(canonicalJSON(payload)), privateKey).toString("base64");
writeFileSync(output, `${JSON.stringify({ payload, signature }, null, 2)}\n`);
console.log(`Signed ${output}; keep the private key offline.`);
