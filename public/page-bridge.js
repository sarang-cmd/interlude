/* Runs in the page world. Never reads navigation URLs, message text, request or chunk data. */
(() => {
  const notifyNavigation = () =>
    window.postMessage({ source: "interlude-navigation" }, location.origin);
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      notifyNavigation();
      return result;
    };
  }
  let enabled = false;
  let installed = false;
  let active = 0;
  const streams = new WeakSet();
  function emit(phase) {
    window.postMessage(
      { source: "interlude-stream-timing", phase, active: active > 0 },
      location.origin,
    );
  }
  function installTiming() {
    if (installed) return;
    installed = true;
    const nativeFetch = window.fetch;
    const nativeGetReader = ReadableStream.prototype.getReader;
    window.fetch = function (...args) {
      return nativeFetch.apply(this, args).then((response) => {
        if (
          enabled &&
          response.body &&
          (response.headers.get("content-type") || "").toLowerCase().includes("text/event-stream")
        ) {
          streams.add(response.body);
          active += 1;
          emit("open");
        }
        return response;
      });
    };
    ReadableStream.prototype.getReader = function (...args) {
      const reader = nativeGetReader.apply(this, args);
      if (!streams.has(this)) return reader;
      streams.delete(this);
      let closed = false;
      const finish = () => {
        if (closed) return;
        closed = true;
        active = Math.max(0, active - 1);
        if (enabled) emit("close");
      };
      const read = reader.read.bind(reader);
      const cancel = reader.cancel.bind(reader);
      reader.read = (...args) =>
        read(...args).then(
          (result) => {
            if (result.done) finish();
            return result;
          },
          (error) => {
            finish();
            throw error;
          },
        );
      reader.cancel = (...args) => {
        finish();
        return cancel(...args);
      };
      return reader;
    };
    // Visible only as a harmless timing-hook presence marker.
    window.__interludeStreamTiming = true;
  }
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      !event.data ||
      event.data.source !== "interlude-stream-control" ||
      typeof event.data.enabled !== "boolean"
    )
      return;
    enabled = event.data.enabled;
    if (enabled) installTiming();
    else active = 0;
  });
})();
