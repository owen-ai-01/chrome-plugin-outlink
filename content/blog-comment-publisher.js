(function blogCommentPublisher() {
  if (window.__outlinkBlogPublisherLoaded) return;
  window.__outlinkBlogPublisherLoaded = true;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const lower = (value) => String(value || "").toLowerCase();
  const contains = (value, words) => words.some((word) => lower(value).includes(word));

  function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function isHoneypot(el) {
    const text = [el?.name, el?.id, el?.className, el?.getAttribute?.("aria-label")].filter(Boolean).join(" ");
    return !isVisible(el) || contains(text, ["honeypot", "trap", "antispam", "anti-spam", "website2", "email2"]);
  }

  function fieldText(el) {
    const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : "";
    return [el.name, el.id, el.className, el.placeholder, el.getAttribute("aria-label"), el.autocomplete, label].filter(Boolean).join(" ");
  }

  function candidates(scope, selector) {
    return Array.from((scope || document).querySelectorAll(selector)).filter((el) => !isHoneypot(el) && !el.disabled);
  }

  function findField(scope, words, selector, preferredTypes = []) {
    return candidates(scope, selector)
      .map((el) => {
        const text = lower(fieldText(el));
        const score = words.reduce((sum, word) => sum + (text.includes(word) ? 8 : 0), 0) + (preferredTypes.includes(lower(el.type)) ? 6 : 0);
        return { el, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.el || null;
  }

  function findCommentForm() {
    return candidates(document, "form")
      .map((form) => {
        const text = `${form.id} ${form.className} ${form.action} ${form.textContent}`;
        const score = (contains(text, ["comment", "reply", "wp-comments-post"]) ? 10 : 0) + (candidates(form, "textarea,[contenteditable='true'],[role='textbox']").length ? 5 : 0);
        return { form, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.form || document;
  }

  function findFields() {
    const scope = findCommentForm();
    const inputs = "input:not([type]),input[type='text'],input[type='email'],input[type='url']";
    return {
      scope,
      commentField: findField(scope, ["comment", "reply", "message", "discussion"], "textarea,[contenteditable='true'],[role='textbox']") || candidates(scope, "textarea,[contenteditable='true'],[role='textbox']")[0] || null,
      nameField: findField(scope, ["author", "name", "username", "nombre", "nom"], inputs, ["text"]),
      emailField: findField(scope, ["email", "e-mail", "mail", "correo"], inputs, ["email"]),
      urlField: findField(scope, ["website", "homepage", "url", "site", "blog", "web"], inputs, ["url"])
    };
  }

  function detectCommentSystem() {
    const host = lower(location.hostname);
    if (host.includes("disqus.com")) return { system: "disqus", confidence: 0.98, reason: "Disqus iframe" };
    if (document.querySelector("#disqus_thread,iframe[src*='disqus.com']")) return { system: "disqus", confidence: 0.9, reason: "页面包含 Disqus" };
    if (document.querySelector(".commento-root,#commento,script[src*='commento']")) return { system: "commento", confidence: 0.9, reason: "页面包含 Commento" };
    if (document.querySelector("#commentform,form[action*='wp-comments-post.php'],textarea#comment")) return { system: "wordpress", confidence: 0.98, reason: "WordPress 原生评论表单" };
    if (findFields().commentField) return { system: "generic", confidence: 0.65, reason: "发现通用评论表单" };
    return { system: "unknown", confidence: 0.1, reason: "未发现支持的评论表单" };
  }

  function findSubmitButton(scope) {
    return candidates(scope, "button,input[type='submit'],[role='button']").find((el) => {
      const text = [el.textContent, el.value, el.name, el.id, el.getAttribute("aria-label")].join(" ");
      return el.getAttribute("aria-disabled") !== "true" && contains(text, ["post comment", "submit comment", "publish", "submit", "reply", "comment"]);
    }) || null;
  }

  const hasCaptcha = () => Boolean(document.querySelector("iframe[src*='recaptcha'],.g-recaptcha,[data-sitekey],iframe[src*='hcaptcha'],.h-captcha,input[name*='captcha' i]"));

  function loginRequired() {
    const body = lower(document.body?.innerText || "");
    return !findFields().commentField && contains(body, ["log in to comment", "sign in to comment", "登录后评论", "登录以发表评论"]);
  }

  function extractArticleContext() {
    const article = document.querySelector("article,.post,.entry-content,.post-content,main") || document.body;
    return {
      url: location.href,
      title: document.querySelector("article h1,h1,.post-title,.entry-title")?.textContent?.trim() || document.title || "",
      language: document.documentElement.lang || "",
      metaDescription: document.querySelector("meta[name='description']")?.content || "",
      text: String(article?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 5000)
    };
  }

  function setInputValue(el, value) {
    if (!el) return false;
    const text = String(value || "");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
    if (el.isContentEditable) el.textContent = text;
    else {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter ? setter.call(el, text) : (el.value = text);
    }
    for (const type of ["input", "change", "blur"]) el.dispatchEvent(new Event(type, { bubbles: true }));
    return true;
  }

  async function revealReplyForm() {
    if (findFields().commentField) return;
    const reply = candidates(document, ".comment-reply-link,a[data-commentid],a[href*='replytocom'],button")
      .find((el) => /^(reply|respond|回复|回应|antworten|répondre|responder|vastaa)$/i.test(String(el.textContent || "").trim()));
    if (reply) {
      reply.scrollIntoView({ block: "center" });
      reply.click();
      await sleep(700);
    }
  }

  function inspectCurrentPage() {
    const detected = detectCommentSystem();
    const fields = findFields();
    const captcha = hasCaptcha();
    return {
      ok: Boolean(fields.commentField), ...detected, article: extractArticleContext(), url: location.href,
      hasCommentField: Boolean(fields.commentField), hasNameField: Boolean(fields.nameField), hasEmailField: Boolean(fields.emailField),
      hasUrlField: Boolean(fields.urlField), hasCaptcha: captcha, loginRequired: loginRequired(),
      recommendedAction: captcha ? "manual" : fields.commentField ? "review" : "skip"
    };
  }

  async function autofillBlogComment(payload) {
    await revealReplyForm();
    const inspection = inspectCurrentPage();
    if (inspection.hasCaptcha) return { ...inspection, ok: false, error: "页面包含验证码，请人工处理" };
    if (inspection.loginRequired) return { ...inspection, ok: false, error: "页面要求登录后评论" };
    const fields = findFields();
    const commentText = !fields.urlField && String(payload?.fallbackComment || "").trim() ? payload.fallbackComment : payload?.comment || "";
    const filled = {
      comment: setInputValue(fields.commentField, commentText),
      authorName: payload?.authorName ? setInputValue(fields.nameField, payload.authorName) : false,
      authorEmail: payload?.authorEmail ? setInputValue(fields.emailField, payload.authorEmail) : false,
      website: payload?.targetUrl ? setInputValue(fields.urlField, payload.targetUrl) : false
    };
    const ok = filled.comment && (!fields.urlField || filled.website);
    let submitTried = false;
    if (ok && payload?.autoSubmit) {
      const submit = findSubmitButton(fields.scope);
      if (submit) { submitTried = true; submit.click(); }
    }
    return { ...inspection, ok, filled, filledCount: Object.values(filled).filter(Boolean).length, submitTried, error: ok ? "" : "未找到可安全填写的评论表单或网址字段" };
  }

  async function submitBlogComment() {
    const inspection = inspectCurrentPage();
    if (inspection.hasCaptcha) return { ...inspection, ok: false, error: "检测到验证码，请人工提交" };
    const submit = findSubmitButton(findFields().scope);
    if (!submit) return { ...inspection, ok: false, error: "未找到提交按钮" };
    submit.click();
    await sleep(1000);
    const page = lower(`${location.href} ${document.body?.innerText || ""}`);
    let verification = "submitted_unknown";
    if (contains(page, ["awaiting moderation", "pending approval", "held for moderation", "等待审核", "待审核"]) || location.search.includes("unapproved=")) verification = "pending_moderation";
    else if (location.hash.startsWith("#comment-") || contains(page, ["comment posted", "comment has been submitted", "评论已发布", "评论已提交"])) verification = "visible_or_accepted";
    else if (contains(page, ["duplicate comment", "comment flood", "spam detected", "comments are closed", "重复评论", "评论已关闭"])) verification = "rejected";
    return { ...inspection, ok: verification !== "rejected", submitTried: true, verification, error: verification === "rejected" ? "站点拒绝了评论" : "" };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === "BLOG_COMMENT_INSPECT") { sendResponse(inspectCurrentPage()); return false; }
    const task = message?.action === "BLOG_COMMENT_SUBMIT" ? submitBlogComment() : message?.action === "BLOG_COMMENT_AUTOFILL" ? autofillBlogComment(message.payload || {}) : null;
    if (!task) return false;
    task.then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  });
})();
