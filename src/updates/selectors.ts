import claude from "../adapters/claude/selectors.json";
import chatgpt from "../adapters/chatgpt/selectors.json";
import gemini from "../adapters/gemini/selectors.json";
import { SITES, type SiteId } from "../settings/schema";
import { SELECTOR_PUBLIC_KEY } from "./publicKey";
import { fetchStaticJSON, safeNetworkError } from "./transport";

export const SELECTOR_CACHE_KEY = "interlude.remoteSelectorCache";
export const SELECTOR_STATUS_KEY = "interlude.remoteSelectorStatus";
export const SELECTOR_INTERVAL_MS = 12 * 60 * 60 * 1000;
export type SelectorGroups = Record<string, string[]>;
export interface SelectorPayload {
  version: 1;
  issuedAt: string;
  sites: Record<SiteId, SelectorGroups>;
}
export interface SignedSelectors {
  payload: SelectorPayload;
  signature: string;
}
export interface SelectorStatus {
  lastCheck: number;
  result: string;
  issuedAt?: string;
}
const defaults: Record<SiteId, SelectorGroups> = { claude, chatgpt, gemini };
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const keysExactly = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

/** Canonical JSON: recursively sorted object keys, arrays retain their order. */
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function validSelectorPayload(value: unknown): value is SelectorPayload {
  if (
    !object(value) ||
    !keysExactly(value, ["version", "issuedAt", "sites"]) ||
    value.version !== 1 ||
    typeof value.issuedAt !== "string"
  )
    return false;
  const timestamp = Date.parse(value.issuedAt);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value.issuedAt)
    return false;
  if (!object(value.sites) || !keysExactly(value.sites, SITES)) return false;
  for (const site of SITES) {
    const groups = value.sites[site];
    if (!object(groups) || !keysExactly(groups, Object.keys(defaults[site]))) return false;
    for (const values of Object.values(groups)) {
      if (
        !Array.isArray(values) ||
        !values.length ||
        values.length > 30 ||
        !values.every(
          (entry) =>
            typeof entry === "string" &&
            entry.length > 0 &&
            entry.length <= 500 &&
            Array.from(entry).every((character) => {
              const code = character.charCodeAt(0);
              return code >= 32 && code !== 127;
            }),
        ) ||
        new Set(values).size !== values.length
      )
        return false;
    }
  }
  return true;
}
function bytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const result = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) result[i] = binary.charCodeAt(i);
  return result;
}
export async function verifySignedSelectors(
  raw: unknown,
  publicKey = SELECTOR_PUBLIC_KEY,
): Promise<SignedSelectors | null> {
  if (
    !object(raw) ||
    !keysExactly(raw, ["payload", "signature"]) ||
    !validSelectorPayload(raw.payload) ||
    typeof raw.signature !== "string" ||
    !/^[A-Za-z0-9+/]{86}==$/.test(raw.signature)
  )
    return null;
  try {
    const keyBytes = bytes(publicKey),
      signature = bytes(raw.signature);
    if (keyBytes.length !== 32 || signature.length !== 64) return null;
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "Ed25519" }, false, [
      "verify",
    ]);
    const data = new TextEncoder().encode(canonicalJSON(raw.payload));
    return (await crypto.subtle.verify({ name: "Ed25519" }, key, signature, data))
      ? { payload: raw.payload, signature: raw.signature }
      : null;
  } catch {
    return null;
  }
}
export async function loadVerifiedSelectors(): Promise<SignedSelectors | null> {
  const raw = (await chrome.storage.local.get(SELECTOR_CACHE_KEY))[SELECTOR_CACHE_KEY];
  return verifySignedSelectors(raw);
}
let pendingCheck: Promise<SelectorStatus> | null = null;
export function checkSelectorUpdates(url: string, now = Date.now()): Promise<SelectorStatus> {
  if (pendingCheck) return pendingCheck;
  pendingCheck = runCheck(url, now).finally(() => {
    pendingCheck = null;
  });
  return pendingCheck;
}
async function runCheck(url: string, now: number): Promise<SelectorStatus> {
  const values = await chrome.storage.local.get([SELECTOR_STATUS_KEY, SELECTOR_CACHE_KEY]);
  const old = values[SELECTOR_STATUS_KEY] as SelectorStatus | undefined;
  if (old && Number.isFinite(old.lastCheck) && now < old.lastCheck + SELECTOR_INTERVAL_MS)
    return old;
  const checking: SelectorStatus = { lastCheck: now, result: "CHECK INTERRUPTED OR IN PROGRESS" };
  await chrome.storage.local.set({ [SELECTOR_STATUS_KEY]: checking });
  try {
    const parsed = await fetchStaticJSON(url);
    const verified = await verifySignedSelectors(parsed);
    if (!verified) throw new Error("INVALID SCHEMA OR SIGNATURE");
    if (Date.parse(verified.payload.issuedAt) > now + 24 * 60 * 60 * 1000)
      throw new Error("FUTURE ISSUE DATE");
    const cached = await verifySignedSelectors(values[SELECTOR_CACHE_KEY]);
    if (cached && Date.parse(verified.payload.issuedAt) < Date.parse(cached.payload.issuedAt))
      throw new Error("OLDER THAN LAST GOOD FILE");
    const status: SelectorStatus = {
      lastCheck: now,
      result: "VERIFIED",
      issuedAt: verified.payload.issuedAt,
    };
    await chrome.storage.local.set({
      [SELECTOR_CACHE_KEY]: verified,
      [SELECTOR_STATUS_KEY]: status,
    });
    return status;
  } catch (error) {
    const detail = safeNetworkError(error, [
      "INVALID SCHEMA OR SIGNATURE",
      "FUTURE ISSUE DATE",
      "OLDER THAN LAST GOOD FILE",
    ]);
    const status: SelectorStatus = { lastCheck: now, result: detail, issuedAt: old?.issuedAt };
    await chrome.storage.local.set({ [SELECTOR_STATUS_KEY]: status });
    return status;
  }
}
