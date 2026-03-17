(() => {
  if (window.__speedmeterHookInstalled) return;
  window.__speedmeterHookInstalled = true;

  const encoder = new TextEncoder();

  function emit(bytes) {
    try {
      document.dispatchEvent(
        new CustomEvent("__speedmeter_upload__", {
          detail: {
            bytes: Math.max(0, Number(bytes) || 0)
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

  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      try {
        const [, init] = args;
        emit(estimateBodySize(init?.body));
      } catch (_) {}
      return originalFetch.apply(this, args);
    };
  }

  if (window.XMLHttpRequest?.prototype?.send) {
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      try {
        emit(estimateBodySize(body));
      } catch (_) {}
      return originalSend.call(this, body);
    };
  }

  if (typeof navigator.sendBeacon === "function") {
    const originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      try {
        emit(estimateBodySize(data));
      } catch (_) {}
      return originalBeacon(url, data);
    };
  }

  document.addEventListener(
    "submit",
    (event) => {
      try {
        const form = event.target;
        if (form instanceof HTMLFormElement) {
          emit(estimateBodySize(new FormData(form)));
        }
      } catch (_) {}
    },
    true
  );
})();