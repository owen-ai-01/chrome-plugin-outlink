(function pageNetworkHook() {
  if (!(location.hostname.includes("ahrefs.com") && location.pathname.includes("/backlink-checker"))) return;
  const requestHints = ["backlink", "backlinks", "refdomain", "referring", "site-explorer", "links"];
  const source = "ahrefs";
  const MAX_URLS = 400;

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

  function emitPayload(requestUrl, body) {
    const urls = [];
    extractUrls(body, urls);
    const candidateUrls = uniq(urls);
    if (candidateUrls.length === 0) return;
    window.postMessage(
      {
        __outlinkHook: true,
        payload: {
          source: `${source}-api`,
          requestUrl,
          candidateUrls
        }
      },
      "*"
    );
  }

  const nativeFetch = window.fetch;
  window.fetch = async function patchedFetch(...args) {
    const response = await nativeFetch.apply(this, args);
    try {
      const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const contentType = response.headers.get("content-type") || "";
      if (isLikelyBacklinkRequest(requestUrl) && contentType.includes("application/json")) {
        response
          .clone()
          .json()
          .then((json) => emitPayload(requestUrl, json))
          .catch(() => {});
      }
    } catch {
      // ignore
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
        const contentType = this.getResponseHeader("content-type") || "";
        if (!isLikelyBacklinkRequest(requestUrl) || !contentType.includes("application/json")) return;
        if (typeof this.responseText !== "string" || !this.responseText) return;
        emitPayload(requestUrl, JSON.parse(this.responseText));
      } catch {
        // ignore
      }
    });
    return nativeSend.apply(this, args);
  };
})();
