(function interceptBacklinkResponses() {
  const ahrefsChecker = location.hostname.includes("ahrefs.com") && location.pathname.includes("/backlink-checker");
  const semrushBacklinks = location.hostname === "sem.3ue.co" && location.pathname.includes("/analytics/backlinks/backlinks");
  if (!ahrefsChecker && !semrushBacklinks) return;
  let autoPagerRunning = false;
  let noNextCount = 0;
  let lastFingerprint = "";

  function textToNumber(text) {
    if (!text || typeof text !== "string") return null;
    const m = text.replace(/,/g, "").match(/\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }

  function sendPayload(payload) {
    try {
      chrome.runtime.sendMessage(
        {
          action: "NETWORK_BACKLINKS_PAYLOAD",
          payload
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error("[outlink] sendMessage failed:", chrome.runtime.lastError.message, payload);
          }
        }
      );
    } catch (error) {
      console.error("[outlink] sendMessage exception:", error, payload);
    }
  }

  function injectPageHook() {
    const marker = "__outlink_hook_injected_v1";
    if (document.documentElement.hasAttribute(marker)) return;
    document.documentElement.setAttribute(marker, "1");
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("content/page-hook.js");
    script.async = false;
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  function parseAhrefsTableRows() {
    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    if (rows.length === 0) return [];
    const items = [];
    for (const row of rows) {
      const links = Array.from(row.querySelectorAll("a[href^='http']"));
      const href = links.map((a) => a.href).find((x) => !x.includes("ahrefs.com"));
      if (!href) continue;
      const rowText = row.textContent || "";
      const cells = Array.from(row.querySelectorAll("td")).map((td) => (td.textContent || "").trim());
      const dr = cells.map(textToNumber).find((n) => typeof n === "number" && n >= 0 && n <= 100) ?? null;
      const traffic = cells.map(textToNumber).find((n) => typeof n === "number" && n > 100) ?? null;
      const anchorCandidate = links.map((a) => (a.textContent || "").trim()).find((t) => t && t.length > 1) || "";
      items.push({
        url: href,
        sourcePage: location.href,
        anchor: anchorCandidate,
        dr,
        traffic,
        raw: rowText.slice(0, 500)
      });
    }
    return items;
  }

  function parseSemrushTableRows() {
    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    if (rows.length === 0) return [];
    const items = [];
    for (const row of rows) {
      const links = Array.from(row.querySelectorAll("a[href]"));
      const href = links
        .map((a) => a.href)
        .find((x) => /^https?:\/\//i.test(x) && !x.includes("sem.3ue.co") && !x.includes("semrush.com"));
      if (!href) continue;

      const rowText = row.textContent || "";
      const cells = Array.from(row.querySelectorAll("td")).map((td) => (td.textContent || "").trim());
      const numbers = cells.map(textToNumber).filter((n) => typeof n === "number");
      const da = numbers.find((n) => n >= 0 && n <= 100) ?? null;
      const traffic = numbers.find((n) => n > 100) ?? null;
      const anchorCandidate = links.map((a) => (a.textContent || "").trim()).find((t) => t && t.length > 1) || "";
      items.push({
        url: href,
        sourcePage: location.href,
        anchor: anchorCandidate,
        da,
        dr: da,
        traffic,
        raw: rowText.slice(0, 700)
      });
    }
    return items;
  }

  function findNextButton() {
    const buttons = Array.from(document.querySelectorAll("button,[role='button'],a"));
    for (const button of buttons) {
      const text = (button.textContent || "").trim().toLowerCase();
      const aria = (button.getAttribute("aria-label") || "").toLowerCase();
      if (text === "next" || text === ">" || text.includes("next page") || aria.includes("next")) {
        const disabled =
          button.hasAttribute("disabled") ||
          button.getAttribute("aria-disabled") === "true" ||
          button.classList.contains("disabled");
        if (!disabled) return button;
      }
    }
    return null;
  }

  async function runAhrefsAutoPager() {
    if (!ahrefsChecker || autoPagerRunning) return;
    autoPagerRunning = true;

    while (noNextCount < 3) {
      const rows = parseAhrefsTableRows();
      const fingerprint = `${location.href}|${rows.length}|${rows[0]?.url || ""}`;

      if (rows.length > 0 && fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        sendPayload({
          source: "ahrefs-dom",
          requestUrl: location.href,
          candidateItems: rows
        });
      }

      const next = findNextButton();
      if (!next) {
        noNextCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 2200));
        continue;
      }

      noNextCount = 0;
      next.click();
      await new Promise((resolve) => setTimeout(resolve, 2600));
    }
  }

  async function runSemrushAutoPager() {
    if (!semrushBacklinks || autoPagerRunning) return;
    autoPagerRunning = true;

    while (noNextCount < 3) {
      const rows = parseSemrushTableRows();
      const fingerprint = `${location.href}|${rows.length}|${rows[0]?.url || ""}`;

      if (rows.length > 0 && fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        sendPayload({
          source: "semrush-dom",
          requestUrl: location.href,
          candidateItems: rows
        });
      }

      const next = findNextButton();
      if (!next) {
        noNextCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 2200));
        continue;
      }

      noNextCount = 0;
      next.click();
      await new Promise((resolve) => setTimeout(resolve, 2600));
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__outlinkHook !== true || !data.payload) return;
    sendPayload(data.payload);
  });

  injectPageHook();

  if (ahrefsChecker) {
    setTimeout(runAhrefsAutoPager, 2500);
  }
  if (semrushBacklinks) {
    setTimeout(runSemrushAutoPager, 2500);
  }
})();
