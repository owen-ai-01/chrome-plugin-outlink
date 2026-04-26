(function productHuntPublisher() {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setInputValue(el, value) {
    if (!el) return false;
    const text = String(value || "");
    el.focus();
    if (el.isContentEditable) {
      el.textContent = text;
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function textContains(text, keywords) {
    const lower = String(text || "").toLowerCase();
    return keywords.some((k) => lower.includes(k));
  }

  function matchesKeywords(text, keywords) {
    return textContains(text, keywords);
  }

  function findByLabel(keywords, selector) {
    const labels = Array.from(document.querySelectorAll("label"));
    for (const label of labels) {
      if (!matchesKeywords(label.textContent, keywords)) continue;
      const forId = label.getAttribute("for");
      if (forId) {
        const byId = document.getElementById(forId);
        if (byId && byId.matches(selector)) return byId;
      }
      const near = label.closest("div")?.querySelector(selector);
      if (near) return near;
    }
    return null;
  }

  function findByPlaceholder(keywords, selector) {
    const fields = Array.from(document.querySelectorAll(selector));
    return (
      fields.find((field) => {
        const placeholder = field.getAttribute("placeholder") || "";
        const ariaLabel = field.getAttribute("aria-label") || "";
        const name = field.getAttribute("name") || "";
        const id = field.getAttribute("id") || "";
        return (
          matchesKeywords(placeholder, keywords) ||
          matchesKeywords(ariaLabel, keywords) ||
          matchesKeywords(name, keywords) ||
          matchesKeywords(id, keywords)
        );
      }) || null
    );
  }

  function findTextInput(keywords) {
    return (
      findByLabel(keywords, 'input[type="text"],input:not([type]),input[type="url"]') ||
      findByPlaceholder(keywords, 'input[type="text"],input:not([type]),input[type="url"]') ||
      findByPlaceholder(keywords, '[role="textbox"]')
    );
  }

  function findTextarea(keywords) {
    return findByLabel(keywords, "textarea,[contenteditable='true']") || findByPlaceholder(keywords, "textarea");
  }

  function findPublishButton() {
    const buttons = Array.from(document.querySelectorAll("button,[role='button']"));
    return (
      buttons.find((btn) => textContains(btn.textContent, ["submit", "publish", "launch", "post now"])) || null
    );
  }

  function findButtonByKeywords(keywords) {
    const buttons = Array.from(document.querySelectorAll("button,[role='button'],a"));
    return (
      buttons.find((btn) => {
        const txt = `${btn.textContent || ""} ${btn.getAttribute("aria-label") || ""}`;
        if (!textContains(txt, keywords)) return false;
        const disabled =
          btn.hasAttribute("disabled") ||
          btn.getAttribute("aria-disabled") === "true" ||
          btn.classList.contains("disabled");
        return !disabled;
      }) || null
    );
  }

  function detectStep() {
    const bodyText = String(document.body?.textContent || "").toLowerCase();
    const path = String(location.pathname || "").toLowerCase();
    if (path.includes("/posts/new")) {
      if (bodyText.includes("website") || bodyText.includes("product url") || bodyText.includes("url")) {
        return "url_or_basics";
      }
      if (bodyText.includes("first comment") || bodyText.includes("description") || bodyText.includes("tagline")) {
        return "details";
      }
      if (bodyText.includes("review") || bodyText.includes("submit") || bodyText.includes("launch")) {
        return "review";
      }
    }
    return "unknown";
  }

  async function autofillProductHunt(payload) {
    const targetUrl = payload?.targetUrl || "";
    const draft = payload?.draft || {};
    const autoSubmit = Boolean(payload?.autoSubmit);

    for (let i = 0; i < 20; i += 1) {
      const urlField = findTextInput(["website", "url", "link"]);
      if (urlField) break;
      await sleep(400);
    }

    const results = {
      name: false,
      tagline: false,
      website: false,
      firstComment: false,
      topics: false
    };

    const step = detectStep();

    if (step === "url_or_basics") {
      const websiteField = findTextInput(["website", "url", "link", "product url"]);
      if (websiteField) {
        results.website = setInputValue(websiteField, targetUrl);
      } else {
        const candidates = Array.from(
          document.querySelectorAll('input[type="url"],input[type="text"],input:not([type]),[role="textbox"]')
        ).filter((el) => el.offsetParent !== null || el.isContentEditable);
        const urlLike = candidates.find((el) =>
          /url|website|link/i.test(
            `${el.getAttribute("name") || ""} ${el.getAttribute("id") || ""} ${el.getAttribute("placeholder") || ""}`
          )
        );
        if (urlLike) results.website = setInputValue(urlLike, targetUrl);
      }
    } else {
      const taglineField = findTextInput(["tagline", "one-liner", "headline"]);
      if (taglineField) {
        results.tagline = setInputValue(taglineField, draft.tagline || "");
      } else {
        const candidates = Array.from(
          document.querySelectorAll('input[type="text"],input:not([type]),[role="textbox"]')
        ).filter((el) => el.offsetParent !== null || el.isContentEditable);
        if (candidates[0]) results.tagline = setInputValue(candidates[0], draft.tagline || "");
      }

      const commentField = findTextarea(["write the first comment", "first comment", "comment"]);
      if (commentField) {
        results.firstComment = setInputValue(commentField, draft.firstComment || "");
      } else {
        const textareas = Array.from(document.querySelectorAll("textarea,[contenteditable='true']")).filter(
          (el) => el.offsetParent !== null || el.isContentEditable
        );
        if (textareas[0]) results.firstComment = setInputValue(textareas[0], draft.firstComment || "");
      }
    }

    let submitTried = false;
    let nextClicked = false;

    const nextBtn = findButtonByKeywords(["next", "continue", "save and continue", "continue"]);
    if (nextBtn) {
      nextBtn.click();
      nextClicked = true;
      await sleep(600);
    }

    if (autoSubmit) {
      const publishBtn = findPublishButton() || findButtonByKeywords(["submit", "publish", "launch", "post now"]);
      if (publishBtn) {
        submitTried = true;
        publishBtn.click();
      }
    }

    const filledCount = Object.values(results).filter(Boolean).length;
    const ok = step === "url_or_basics" ? results.website || nextClicked : results.tagline || results.firstComment || nextClicked;
    return {
      ok,
      filled: results,
      submitTried,
      filledCount,
      nextClicked,
      step,
      url: location.href,
      error: ok ? "" : "未找到可填写字段（请确认 Product Hunt 已登录并在 /posts/new 页面）"
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action !== "PRODUCTHUNT_AUTOFILL") return false;
    autofillProductHunt(message.payload || {})
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  });
})();
