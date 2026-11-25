import { isThreeSearchTask } from "./three-in-row";
import { searchInWorker } from "./worker-client";

// The frame has no access to chat content. Accept one private port from its
// immediate parent and only bounded, data-only three-in-a-row requests.
let connected = false;
const controller = new AbortController();
window.addEventListener("pagehide", () => controller.abort(), { once: true });
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const allowed = [
    "https://claude.ai",
    "https://chatgpt.com",
    "https://gemini.google.com",
    location.origin,
  ];
  if (
    connected ||
    event.source !== window.parent ||
    !allowed.includes(event.origin) ||
    !event.data ||
    typeof event.data !== "object" ||
    !("kind" in event.data) ||
    event.data.kind !== "interlude-ai-port" ||
    event.ports.length !== 1
  )
    return;
  connected = true;
  const port = event.ports[0]!;
  port.onmessage = (request: MessageEvent<unknown>): void => {
    port.onmessage = null;
    if (!isThreeSearchTask(request.data)) {
      port.postMessage({ ok: false });
      port.close();
      return;
    }
    void searchInWorker(request.data, 1500, controller.signal).then(
      (result) => {
        port.postMessage({ ok: true, result });
        port.close();
      },
      () => {
        port.postMessage({ ok: false });
        port.close();
      },
    );
  };
  port.start();
});
