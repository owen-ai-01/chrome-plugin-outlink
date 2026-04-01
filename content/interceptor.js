(function interceptBacklinkResponses() {
  const MAX_URLS = 250;
  const source = location.hostname.includes("semrush") ? "semrush" : "ahrefs";
  const requestHints = ["backlink", "backlinks", "refdomain", "referring", "site-explorer", "links"];

  function isLikelyBacklinkRequest(url) {
    const lower = String(url || "").toLowerCase();
    return requestHints.some((hint) => lower.includes(hint));
  }

  function isHttpUrl(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value);
  }

  function extractUrls(input, bucket) {
    if (bucket.length >= MAX_URLS) return;
    if (isHttpUrl(input)) {
      bucket.push(input);
      return;
    }
    if (!input || typeof input !== "object") return;
    if (Array.isArray(input)) {
      for (const item of input) {
        extractUrls(item, bucket);
        if (bucket.length >= MAX_URLS) break;
      }
      return;
    }
    for (const key of Object.keys(input)) {
      extractUrls(input[key], bucket);
      if (bucket.length >= MAX_URLS) break;
    }
  }

  function uniq(list) {
    const seen = Object.create(null);
    const output = [];
    for (const item of list) {
      if (seen[item]) continue;
      seen[item] = true;
      output.push(item);
    }
    return output;
  }

  function sendPayload(requestUrl, body) {
    const bucket = [];
    extractUrls(body, bucket);
    const candidateUrls = uniq(bucket);
    if (candidateUrls.length === 0) return;
    chrome.runtime.sendMessage({
      action: "NETWORK_BACKLINKS_PAYLOAD",
      payload: {
        source,
        requestUrl,
        candidateUrls
      }
    });
  }

  const nativeFetch = window.fetch;
  window.fetch = async function patchedFetch(...args) {
    const response = await nativeFetch.apply(this, args);
    try {
      const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const contentType = response.headers.get("content-type") || "";
      if (isLikelyBacklinkRequest(requestUrl) && contentType.includes("application/json")) {
        const clone = response.clone();
        clone
          .json()
          .then((json) => sendPayload(requestUrl, json))
          .catch(() => {});
      }
    } catch {
      // Ignore extraction errors to avoid page-side breakage.
    }
    return response;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
    this.__outlink_url = url;
    return nativeOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function patchedSend(...args) {
    this.addEventListener("load", function onLoad() {
      try {
        const requestUrl = this.__outlink_url || this.responseURL || "";
        const type = this.getResponseHeader("content-type") || "";
        if (!isLikelyBacklinkRequest(requestUrl) || !type.includes("application/json")) return;
        if (typeof this.responseText !== "string" || this.responseText.length === 0) return;
        const parsed = JSON.parse(this.responseText);
        sendPayload(requestUrl, parsed);
      } catch {
        // Ignore extraction errors to avoid page-side breakage.
      }
    });
    return nativeSend.apply(this, args);
  };
})();
