(() => {
  if (window.__speedmeterHookInstalled) return;
  window.__speedmeterHookInstalled = true;

  const encoder = new TextEncoder();
  let seq = 0;

  function nextId(prefix) {
    seq += 1;
    return `${prefix}-${Date.now()}-${seq}`;
  }

  function emit(name, detail) {
    try {
      document.dispatchEvent(
        new CustomEvent(name, {
          detail: {
            ...detail,
            ts: detail?.ts || Date.now()
          }
        })
      );
    } catch (_) {}
  }

  function byteLengthOfString(value) {
    try {
      return encoder.encode(String(value)).length;
    } catch (_) {
      return 0;
    }
  }

  function estimateBodySize(body) {
    try {
      if (body == null) return 0;

      if (typeof body === "string") return byteLengthOfString(body);
      if (body instanceof Blob) return body.size || 0;
      if (body instanceof ArrayBuffer) return body.byteLength || 0;
      if (ArrayBuffer.isView(body)) return body.byteLength || 0;
      if (body instanceof URLSearchParams) return byteLengthOfString(body.toString());

      if (body instanceof FormData) {
        let total = 0;
        for (const [key, value] of body.entries()) {
          total += byteLengthOfString(key);
          if (typeof value === "string") total += byteLengthOfString(value);
          else if (value instanceof Blob) total += value.size || 0;
        }
        return total;
      }

      if (typeof body === "object") {
        try {
          return byteLengthOfString(JSON.stringify(body));
        } catch (_) {
          return 0;
        }
      }

      return 0;
    } catch (_) {
      return 0;
    }
  }

  // ---- XHR exact/near-exact upload progress ----
  if (window.XMLHttpRequest?.prototype?.send) {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try {
        this.__speedmeterUploadMeta = {
          requestId: nextId("xhr"),
          method: method || "GET",
          url: String(url || ""),
          startTs: 0,
          estimatedBytes: 0,
          lastLoaded: 0,
          sawProgress: false
        };
      } catch (_) {}

      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
      try {
        const meta =
          this.__speedmeterUploadMeta ||
          (this.__speedmeterUploadMeta = {
            requestId: nextId("xhr"),
            method: "GET",
            url: "",
            startTs: 0,
            estimatedBytes: 0,
            lastLoaded: 0,
            sawProgress: false
          });

        meta.startTs = Date.now();
        meta.estimatedBytes = estimateBodySize(body);
        meta.lastLoaded = 0;
        meta.sawProgress = false;

        emit("__speedmeter_upload_lifecycle__", {
          kind: "xhr-start",
          requestId: meta.requestId,
          estimatedBytes: meta.estimatedBytes,
          ts: meta.startTs
        });

        if (this.upload) {
          this.upload.addEventListener(
            "progress",
            (event) => {
              try {
                const loaded = Math.max(0, Number(event.loaded) || 0);
                const total = Math.max(0, Number(event.total) || 0);
                const deltaBytes = Math.max(0, loaded - (meta.lastLoaded || 0));

                if (deltaBytes > 0) {
                  meta.sawProgress = true;
                  meta.lastLoaded = loaded;

                  emit("__speedmeter_upload_progress__", {
                    requestId: meta.requestId,
                    deltaBytes,
                    loaded,
                    total
                  });
                }
              } catch (_) {}
            },
            { passive: true }
          );
        }

        this.addEventListener(
          "loadend",
          () => {
            try {
              emit("__speedmeter_upload_lifecycle__", {
                kind: "xhr-end",
                requestId: meta.requestId,
                estimatedBytes: meta.estimatedBytes,
                loaded: meta.lastLoaded || 0,
                sawProgress: !!meta.sawProgress
              });
            } catch (_) {}
          },
          { once: true }
        );
      } catch (_) {}

      return originalSend.call(this, body);
    };
  }

  // ---- fetch fallback estimate over request duration ----
  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch;

    window.fetch = function (...args) {
      let requestId = null;
      let estimatedBytes = 0;
      let startTs = 0;

      try {
        const [, init] = args;
        requestId = nextId("fetch");
        estimatedBytes = estimateBodySize(init?.body);
        startTs = Date.now();

        if (estimatedBytes > 0) {
          emit("__speedmeter_upload_lifecycle__", {
            kind: "fetch-start",
            requestId,
            estimatedBytes,
            ts: startTs
          });
        }
      } catch (_) {}

      const result = originalFetch.apply(this, args);

      if (requestId && estimatedBytes > 0) {
        Promise.resolve(result).finally(() => {
          try {
            emit("__speedmeter_upload_lifecycle__", {
              kind: "fetch-end",
              requestId,
              estimatedBytes,
              ts: Date.now()
            });
          } catch (_) {}
        });
      }

      return result;
    };
  }

  // ---- sendBeacon immediate estimate ----
  if (typeof navigator.sendBeacon === "function") {
    const originalBeacon = navigator.sendBeacon.bind(navigator);

    navigator.sendBeacon = function (url, data) {
      try {
        const bytes = estimateBodySize(data);
        if (bytes > 0) {
          emit("__speedmeter_upload_lifecycle__", {
            kind: "beacon",
            bytes,
            ts: Date.now()
          });
        }
      } catch (_) {}

      return originalBeacon(url, data);
    };
  }

  // ---- regular form submit fallback ----
  document.addEventListener(
    "submit",
    (event) => {
      try {
        const form = event.target;
        if (form instanceof HTMLFormElement) {
          const bytes = estimateBodySize(new FormData(form));
          if (bytes > 0) {
            emit("__speedmeter_upload_lifecycle__", {
              kind: "form-submit",
              bytes,
              ts: Date.now()
            });
          }
        }
      } catch (_) {}
    },
    true
  );
})();