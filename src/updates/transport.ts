/** Only static configuration/release JSON goes through this credential-free transport. */
export async function fetchStaticJSON(url: string): Promise<unknown> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error("INVALID URL");
  }
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  )
    throw new Error("INVALID URL");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(target.href, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("HTTP ERROR");
    if (!response.body) throw new Error("INVALID JSON");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let count = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      count += result.value.byteLength;
      if (count > 200_000) {
        await reader.cancel();
        throw new Error("FILE TOO LARGE");
      }
      chunks.push(result.value);
    }
    const all = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all)) as unknown;
    } catch {
      throw new Error("INVALID JSON");
    }
  } finally {
    clearTimeout(timeout);
  }
}
export function safeNetworkError(error: unknown, extra: readonly string[] = []): string {
  const allowed = ["INVALID URL", "HTTP ERROR", "FILE TOO LARGE", "INVALID JSON", ...extra];
  return error instanceof Error && allowed.includes(error.message)
    ? error.message
    : "NETWORK OR CORS ERROR";
}
