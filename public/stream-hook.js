/* Optional MAIN-world instrumentation. No URL, body, chunk, or message data is read.
   It observes only whether an event-stream reader has finished or been cancelled. */
(() => {
  if (window.__interludeStreamTiming) {
    window.__interludeStreamTiming.enable();
    return;
  }
  let enabled = true;
  let active = 0;
  const streams = new WeakSet();
  const nativeFetch = window.fetch;
  const nativeGetReader = ReadableStream.prototype.getReader;
  function emit(phase) {
    window.postMessage(
      { source: "interlude-stream-timing", phase, active: active > 0 },
      location.origin,
    );
  }
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
    reader.read = (...readArgs) =>
      read(...readArgs).then(
        (result) => {
          if (result.done) finish();
          return result;
        },
        (error) => {
          finish();
          throw error;
        },
      );
    reader.cancel = (...cancelArgs) => {
      finish();
      return cancel(...cancelArgs);
    };
    return reader;
  };
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      !event.data ||
      event.data.source !== "interlude-stream-control" ||
      typeof event.data.enabled !== "boolean"
    )
      return;
    enabled = event.data.enabled;
    if (!enabled) active = 0;
  });
  window.__interludeStreamTiming = {
    enable: () => {
      enabled = true;
    },
  };
})();
