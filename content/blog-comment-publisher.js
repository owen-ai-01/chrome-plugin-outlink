(function blogCommentPublisher() {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function textContains(text, keywords) {
    const lower = String(text || "").toLowerCase();
    return keywords.some((keyword) => lower.includes(keyword));
  }

  function detectCommentSystem() {
    const host = location.hostname.toLowerCase();
    if (host.includes("disqus.com")) {
      return { system: "disqus", confidence: 0.95, reason: "Disqus iframe" };
    }
    if (document.querySelector("#disqus_thread,iframe[src*='disqus.com']")) {
      return { system: "disqus", confidence: 0.9, reason: "页面包含 Disqus 嵌入" };
    }
    if (document.querySelector(".commento-root,#commento,script[src*='commento']")) {
      return { system: "commento", confidence: 0.9, reason: "页面包含 Commento 容器" };
    }
    if (document.querySelector("#commentform,form[action*='wp-comments-post.php'],textarea#comment")) {
      return { system: "wordpress", confidence: 0.95, reason: "WordPress 原生评论表单" };
    }
    if (findField(["comment", "reply", "message"], "textarea,[contenteditable='true']")) {
      return { system: "generic", confidence: 0.6, reason: "发现通用评论输入框" };
    }
    return { system: "unknown", confidence: 0.1, reason: "未识别到支持的评论系统" };
  }

  function extractArticleContext() {
    const title =
      document.querySelector("article h1,h1,.post-title,.entry-title")?.textContent?.trim() ||
      document.title ||
      "";
    const article = document.querySelector("article,.post,.entry-content,.post-content,main") || document.body;
    const text = String(article?.innerText || document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
    const metaDescription = document.querySelector("meta[name='description']")?.getAttribute("content") || "";
    return {
      url: location.href,
      title,
      metaDescription,
      text
    };
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
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

  function fieldText(el) {
    return [
      el.getAttribute("name"),
      el.getAttribute("id"),
      el.getAttribute("placeholder"),
      el.getAttribute("aria-label"),
      el.getAttribute("autocomplete")
    ]
      .filter(Boolean)
      .join(" ");
  }

  function findByLabel(keywords, selector) {
    const labels = Array.from(document.querySelectorAll("label"));
    for (const label of labels) {
      if (!textContains(label.textContent, keywords)) continue;
      const forId = label.getAttribute("for");
      if (forId) {
        const byId = document.getElementById(forId);
        if (byId && byId.matches(selector) && isVisible(byId)) return byId;
      }
      const near = label.closest("p,div,li,form")?.querySelector(selector);
      if (near && isVisible(near)) return near;
    }
    return null;
  }

  function findField(keywords, selector) {
    return (
      findByLabel(keywords, selector) ||
      Array.from(document.querySelectorAll(selector)).find((el) => isVisible(el) && textContains(fieldText(el), keywords)) ||
      null
    );
  }

  function findCommentForm() {
    const forms = Array.from(document.querySelectorAll("form")).filter(isVisible);
    return (
      forms.find((form) => {
        const text = `${form.getAttribute("id") || ""} ${form.getAttribute("class") || ""} ${form.textContent || ""}`;
        return textContains(text, ["comment", "reply", "leave a reply", "post a comment"]);
      }) || document
    );
  }

  function findSubmitButton(scope) {
    const buttons = Array.from(scope.querySelectorAll("button,input[type='submit'],[role='button']")).filter(isVisible);
    return (
      buttons.find((button) => {
        const text = [
          button.textContent,
          button.value,
          button.getAttribute("aria-label"),
          button.getAttribute("name"),
          button.getAttribute("id")
        ].join(" ");
        const disabled =
          button.hasAttribute("disabled") ||
          button.getAttribute("aria-disabled") === "true" ||
          button.classList.contains("disabled");
        return !disabled && textContains(text, ["post comment", "submit comment", "submit", "publish", "comment", "reply"]);
      }) || null
    );
  }

  function findFieldsForSystem(system) {
    const scope = findCommentForm();
    if (system === "commento") {
      return {
        scope,
        commentField:
          findField(["comment", "reply", "markdown"], "textarea,[contenteditable='true']") ||
          document.querySelector(".commento-root textarea,.commento-root [contenteditable='true']"),
        nameField: findField(["name", "author"], "input[type='text'],input:not([type])"),
        emailField: findField(["email"], "input[type='email'],input[type='text'],input:not([type])"),
        urlField: findField(["website", "url", "site"], "input[type='url'],input[type='text'],input:not([type])")
      };
    }
    if (system === "disqus") {
      return {
        scope,
        commentField:
          findField(["comment", "join the discussion", "discussion"], "textarea,[contenteditable='true'],[role='textbox']") ||
          document.querySelector("textarea,[contenteditable='true'],[role='textbox']"),
        nameField: findField(["name", "guest"], "input[type='text'],input:not([type])"),
        emailField: findField(["email"], "input[type='email'],input[type='text'],input:not([type])"),
        urlField: findField(["website", "url"], "input[type='url'],input[type='text'],input:not([type])")
      };
    }
    return {
      scope,
      commentField:
        findField(["comment", "reply", "message"], "textarea,[contenteditable='true']") ||
        Array.from(scope.querySelectorAll("textarea,[contenteditable='true']")).find(isVisible),
      nameField: findField(["author", "name", "your name"], "input[type='text'],input:not([type])"),
      emailField: findField(["email", "e-mail"], "input[type='email'],input[type='text'],input:not([type])"),
      urlField: findField(["url", "website", "site", "homepage"], "input[type='url'],input[type='text'],input:not([type])")
    };
  }

  async function autofillBlogComment(payload) {
    const authorName = payload?.authorName || "";
    const authorEmail = payload?.authorEmail || "";
    const targetUrl = payload?.targetUrl || "";
    const comment = payload?.comment || "";
    const autoSubmit = Boolean(payload?.autoSubmit);

    for (let i = 0; i < 20; i += 1) {
      if (findField(["comment", "reply", "message"], "textarea,[contenteditable='true']")) break;
      await sleep(300);
    }

    const detected = detectCommentSystem();
    const { scope, commentField, nameField, emailField, urlField } = findFieldsForSystem(detected.system);

    const filled = {
      comment: setInputValue(commentField, comment),
      authorName: authorName ? setInputValue(nameField, authorName) : false,
      authorEmail: authorEmail ? setInputValue(emailField, authorEmail) : false,
      website: targetUrl ? setInputValue(urlField, targetUrl) : false
    };

    let submitTried = false;
    if (autoSubmit) {
      const submitButton = findSubmitButton(scope);
      if (submitButton) {
        submitTried = true;
        submitButton.click();
      }
    }

    const ok = filled.comment && (filled.website || !urlField);
    return {
      ok,
      filled,
      filledCount: Object.values(filled).filter(Boolean).length,
      submitTried,
      system: detected.system,
      url: location.href,
      error: ok ? "" : "未找到可填写的评论表单或网址字段"
    };
  }

  async function submitBlogComment() {
    const detected = detectCommentSystem();
    const { scope } = findFieldsForSystem(detected.system);
    const submitButton = findSubmitButton(scope);
    if (!submitButton) {
      return { ok: false, system: detected.system, url: location.href, error: "未找到提交按钮" };
    }
    submitButton.click();
    await sleep(800);
    return { ok: true, system: detected.system, url: location.href, submitTried: true };
  }

  function inspectCurrentPage() {
    const detected = detectCommentSystem();
    const article = extractArticleContext();
    return {
      ok: detected.system !== "unknown",
      ...detected,
      article,
      url: location.href
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === "BLOG_COMMENT_INSPECT") {
      sendResponse(inspectCurrentPage());
      return false;
    }
    if (message?.action === "BLOG_COMMENT_SUBMIT") {
      submitBlogComment()
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
      return true;
    }
    if (message?.action !== "BLOG_COMMENT_AUTOFILL") return false;
    autofillBlogComment(message.payload || {})
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  });
})();
