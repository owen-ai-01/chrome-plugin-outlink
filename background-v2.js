const DB_KEY = "outlink_db_v2";
const DEFAULT_DB = {
  tables: {
    collection: [],
    publish: [],
    logs: [],
    resources: []
  },
  publishConfig: {
    openrouterApiKey: "",
    openrouterModel: "google/gemini-2.0-flash-001",
    autoSubmitProductHunt: false,
    blogAuthorName: "",
    blogAuthorEmail: "",
    blogWebsiteUrl: "",
    autoSubmitBlogComment: false
  },
  publishState: {
    productHuntPending: null,
    blogCommentPending: null
  },
  collectionState: {
    targetDomain: "",
    source: "ahrefs-backlink-checker",
    status: "idle",
    startedAt: null,
    counts: {
      discovered: 0,
      analyzed: 0,
      blogCommentResources: 0,
      queued: 0,
      nonSpam: 0,
      noRegisterBlogComment: 0
    },
    queue: [],
    seenByUrl: {},
    recent: []
  }
};

const SOURCE_URLS = {
  ahrefs: (domain) => `https://ahrefs.com/backlink-checker/?input=${encodeURIComponent(domain)}&mode=subdomains`,
  semrush: (domain) => `https://sem.3ue.co/analytics/backlinks/backlinks/?q=${encodeURIComponent(domain)}&searchType=domain&ba_mt=active`
};

const SPAM_KEYWORDS = [
  "casino",
  "bet",
  "porn",
  "sex",
  "viagra",
  "loan",
  "payday",
  "gambling",
  "adult",
  "drug",
  "essay",
  "hack",
  "crack",
  "torrent"
];

const SUSPICIOUS_TLDS = [".xyz", ".top", ".click", ".work", ".buzz", ".rest", ".gq", ".cf", ".tk", ".ml"];
const BLOG_COMMENT_MARKERS = ["comment", "replytocom", "leave-a-reply", "wp-comments", "disqus", "blog", "post", "article"];
const REQUIRE_LOGIN_MARKERS = ["wp-login", "signin", "sign-in", "signup", "sign-up", "register", "account/login"];
const SOCIAL_DOMAINS = [
  "facebook.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
  "reddit.com",
  "threads.net"
];
const NEWS_MARKERS = ["news", "press", "media", "magazine", "journal", "daily", "times", "tribune", "herald", "bloomberg", "reuters"];
const PAID_LINK_MARKERS = ["sponsored", "advertise", "advertising", "paid", "pricing", "partnership", "promo", "affiliate"];
const COMMUNITY_MARKERS = ["forum", "community", "discussion", "topic", "thread", "question", "answers", "stackexchange", "quora"];

function setupSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

setupSidePanel();
chrome.runtime.onInstalled.addListener(setupSidePanel);
chrome.runtime.onStartup.addListener(setupSidePanel);

async function getDB() {
  const data = await chrome.storage.local.get(DB_KEY);
  return data[DB_KEY] || structuredClone(DEFAULT_DB);
}

async function setDB(db) {
  await chrome.storage.local.set({ [DB_KEY]: db });
}

function makeBackupPayload(db) {
  return {
    format: "outlink-backup-v1",
    exportedAt: new Date().toISOString(),
    data: db
  };
}

function normalizeImportedDB(input) {
  const raw = input?.data || input;
  const db = structuredClone(DEFAULT_DB);
  if (!raw || typeof raw !== "object") return db;
  if (raw.tables && typeof raw.tables === "object") {
    db.tables.collection = Array.isArray(raw.tables.collection) ? raw.tables.collection : [];
    db.tables.publish = Array.isArray(raw.tables.publish) ? raw.tables.publish : [];
    db.tables.logs = Array.isArray(raw.tables.logs) ? raw.tables.logs : [];
    db.tables.resources = Array.isArray(raw.tables.resources) ? raw.tables.resources : [];
  }
  if (raw.publishConfig && typeof raw.publishConfig === "object") {
    db.publishConfig = {
      ...db.publishConfig,
      ...raw.publishConfig
    };
  }
  if (raw.publishState && typeof raw.publishState === "object") {
    db.publishState = {
      ...db.publishState,
      ...raw.publishState
    };
  }
  if (raw.collectionState && typeof raw.collectionState === "object") {
    db.collectionState = {
      ...db.collectionState,
      ...raw.collectionState,
      counts: {
        ...db.collectionState.counts,
        ...(raw.collectionState.counts || {})
      },
      queue: Array.isArray(raw.collectionState.queue) ? raw.collectionState.queue : [],
      seenByUrl: raw.collectionState.seenByUrl && typeof raw.collectionState.seenByUrl === "object" ? raw.collectionState.seenByUrl : {},
      recent: Array.isArray(raw.collectionState.recent) ? raw.collectionState.recent : []
    };
  }
  return db;
}

function normalizeDomain(input) {
  const cleaned = (input || "").trim().toLowerCase();
  if (!cleaned) return "";
  try {
    const asUrl = cleaned.includes("://") ? new URL(cleaned) : new URL(`https://${cleaned}`);
    return asUrl.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeUrl(input) {
  try {
    const url = new URL(input);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function isLikelyBlogCommentResource(url) {
  try {
    const u = new URL(url);
    const joined = `${u.pathname} ${u.search}`.toLowerCase();
    return BLOG_COMMENT_MARKERS.some((marker) => joined.includes(marker));
  } catch {
    return false;
  }
}

function hostnameMatchesAny(domain, domains) {
  return domains.some((item) => domain === item || domain.endsWith(`.${item}`));
}

function classifySemrushPublishable(row) {
  const url = String(row?.url || "");
  let domain = String(row?.domain || "");
  try {
    domain = domain || new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return {
      semrushPublishable: false,
      publishableType: "unknown",
      publishableReason: "URL 无效"
    };
  }
  const text = `${url} ${domain} ${row?.anchor || ""} ${row?.raw || ""}`.toLowerCase();

  if (hostnameMatchesAny(domain, SOCIAL_DOMAINS)) {
    return {
      semrushPublishable: false,
      publishableType: "social",
      publishableReason: "已过滤：社交媒体"
    };
  }
  if (PAID_LINK_MARKERS.some((marker) => text.includes(marker))) {
    return {
      semrushPublishable: false,
      publishableType: "paid",
      publishableReason: "已过滤：疑似付费/赞助链接"
    };
  }
  if (NEWS_MARKERS.some((marker) => text.includes(marker))) {
    return {
      semrushPublishable: false,
      publishableType: "news_media",
      publishableReason: "已过滤：新闻媒体，通常不能发评论"
    };
  }
  if (isLikelyBlogCommentResource(url)) {
    return {
      semrushPublishable: true,
      publishableType: "blog",
      publishableReason: "博客/文章/评论页候选"
    };
  }
  if (COMMUNITY_MARKERS.some((marker) => text.includes(marker))) {
    return {
      semrushPublishable: true,
      publishableType: "community",
      publishableReason: "社区/讨论页候选"
    };
  }

  return {
    semrushPublishable: false,
    publishableType: "generic",
    publishableReason: "已过滤：不是博客或社区类型"
  };
}

function parseNumber(input) {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const matched = cleaned.match(/\d+(\.\d+)?/);
  if (!matched) return null;
  return Number(matched[0]);
}

function detectResourceType(url, isBlogComment) {
  const lower = String(url || "").toLowerCase();
  if (/\/(profile|user|author|member)\b/.test(lower)) return "profile";
  if (isBlogComment) return "blog_comment";
  return "unknown";
}

function buildResourceMeta({ targetDomain, url, isBlogComment, noRegisterLikely }) {
  return {
    type: detectResourceType(url, isBlogComment),
    discoveredFrom: `ahrefs:${targetDomain || ""}`,
    hasCaptcha: "unknown",
    linkStrategy: isBlogComment ? "url_field" : "unknown",
    linkFormat: "unknown",
    hasUrlField: isBlogComment ? "Yes" : "unknown",
    noRegisterLikely: Boolean(noRegisterLikely)
  };
}

function normalizeResourceRecord(row) {
  if (!row || typeof row !== "object") return row;
  const meta = buildResourceMeta({
    targetDomain: row.targetDomain || "",
    url: row.url || "",
    isBlogComment: Boolean(row.isBlogCommentCandidate),
    noRegisterLikely: Boolean(row.noRegisterLikely)
  });
  return {
    ...row,
    type: row.type || meta.type,
    discoveredFrom: row.discoveredFrom || meta.discoveredFrom,
    hasCaptcha: row.hasCaptcha || meta.hasCaptcha,
    linkStrategy: row.linkStrategy || meta.linkStrategy,
    linkFormat: row.linkFormat || meta.linkFormat,
    hasUrlField: row.hasUrlField || meta.hasUrlField
  };
}

function parseBoolish(value, defaultValue = false) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return defaultValue;
  const lower = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "是"].includes(lower)) return true;
  if (["0", "false", "no", "n", "否"].includes(lower)) return false;
  return defaultValue;
}

function parseDomainFromDiscoveredFrom(value) {
  const raw = String(value || "").trim();
  const m = raw.match(/^ahrefs:(.+)$/i);
  return m ? normalizeDomain(m[1]) : "";
}

function buildImportedResource(input) {
  const url = normalizeUrl(input.url || input.URL || "");
  if (!url) return null;
  const now = new Date().toISOString();
  let domain = "";
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  const discoveredFrom = input.discoveredFrom || input["Discovered From"] || "";
  const targetDomain = normalizeDomain(input.targetDomain || parseDomainFromDiscoveredFrom(discoveredFrom));
  const dr = parseNumber(input.dr ?? input.DR);
  const da = parseNumber(input.da ?? input.DA ?? input.authorityScore ?? input["Authority Score"]);
  const traffic = parseNumber(input.traffic ?? input.Traffic);
  const spamScore = parseNumber(input.spamScore ?? input.SPAM) ?? 0;
  const isBlogCommentCandidate = parseBoolish(input.isBlogCommentCandidate ?? input["博客评论"], false);
  const noRegisterLikely = parseBoolish(input.noRegisterLikely ?? input["免注册候选"], false);
  const isNonSpam = typeof input.isNonSpam === "boolean" ? input.isNonSpam : spamScore < 40;
  const meta = buildResourceMeta({
    targetDomain,
    url,
    isBlogComment: isBlogCommentCandidate,
    noRegisterLikely
  });

  return normalizeResourceRecord({
    id: crypto.randomUUID(),
    batchId: input.batchId || "",
    targetDomain,
    url,
    domain,
    source: input.source || "import",
    sourcePage: input.sourcePage || "",
    anchor: input.anchor || "",
    dr,
    da,
    traffic,
    spamScore,
    isNonSpam,
    nonSpamReason: input.nonSpamReason || (isNonSpam ? "导入数据判定为非 SPAM" : "导入数据判定为 SPAM"),
    isBlogCommentCandidate,
    noRegisterLikely,
    noRegisterReason: input.noRegisterReason || (noRegisterLikely ? "导入标记为免注册候选" : "导入数据未标记免注册候选"),
    type: input.type || input.Type || meta.type,
    discoveredFrom: input.discoveredFrom || input["Discovered From"] || meta.discoveredFrom,
    hasCaptcha: input.hasCaptcha || input["Has Captcha"] || meta.hasCaptcha,
    linkStrategy: input.linkStrategy || input["Link Strategy"] || meta.linkStrategy,
    linkFormat: input.linkFormat || input["Link Format"] || meta.linkFormat,
    hasUrlField: input.hasUrlField || input["Has URL Field"] || meta.hasUrlField,
    status: input.status || (isNonSpam ? "queued" : "filtered_spam"),
    createdAt: input.createdAt || now,
    updatedAt: now
  });
}

function evaluateSpam(item) {
  const urlText = `${item.url || ""} ${item.anchor || ""}`.toLowerCase();
  const domain = item.domain || "";
  let spamScore = 0;
  const reasons = [];

  if (SPAM_KEYWORDS.some((word) => urlText.includes(word))) {
    spamScore += 55;
    reasons.push("命中敏感垃圾词");
  }
  if (SUSPICIOUS_TLDS.some((tld) => domain.endsWith(tld))) {
    spamScore += 20;
    reasons.push("可疑顶级域名");
  }
  if (/\b(comment\-author|cheap|free\-money|bonus)\b/i.test(urlText)) {
    spamScore += 20;
    reasons.push("疑似模板化垃圾模式");
  }
  if (typeof item.dr === "number") {
    if (item.dr < 5) {
      spamScore += 15;
      reasons.push("DR 过低");
    }
    if (item.dr >= 30) {
      spamScore -= 10;
      reasons.push("DR 较高");
    }
  }
  if (typeof item.traffic === "number") {
    if (item.traffic <= 0) {
      spamScore += 10;
      reasons.push("无自然流量");
    }
    if (item.traffic > 100) {
      spamScore -= 10;
      reasons.push("有自然流量");
    }
  }

  spamScore = Math.max(0, Math.min(100, spamScore));
  return {
    spamScore,
    isNonSpam: spamScore < 40,
    nonSpamReason: spamScore < 40 ? "通过非 SPAM 筛选" : reasons.join("，") || "未通过非 SPAM 筛选"
  };
}

function evaluateNoRegisterBlogComment(item) {
  const url = item.url || "";
  const lower = url.toLowerCase();
  const isBlogComment = isLikelyBlogCommentResource(url);

  if (!isBlogComment) {
    return {
      isBlogComment,
      noRegisterLikely: false,
      noRegisterReason: "非博客评论型 URL"
    };
  }
  if (REQUIRE_LOGIN_MARKERS.some((marker) => lower.includes(marker))) {
    return {
      isBlogComment,
      noRegisterLikely: false,
      noRegisterReason: "URL 命中登录/注册标识"
    };
  }
  if (/replytocom|leave-a-reply|comments?/i.test(lower)) {
    return {
      isBlogComment,
      noRegisterLikely: true,
      noRegisterReason: "评论型 URL 且未命中登录注册标识"
    };
  }

  return {
    isBlogComment,
    noRegisterLikely: false,
    noRegisterReason: "博客文章资源，建议人工验证是否免注册"
  };
}

async function appendLog(db, message, level = "info") {
  db.tables.logs.unshift({
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    level,
    message
  });
  db.tables.logs = db.tables.logs.slice(0, 1000);
}

function buildStateSummary(state) {
  return {
    targetDomain: state.targetDomain,
    source: state.source,
    status: state.status,
    counts: state.counts,
    recent: state.recent.slice(0, 30)
  };
}

function computeCounts(resources, queue) {
  let nonSpam = 0;
  let blogCommentResources = 0;
  let noRegisterBlogComment = 0;
  for (const row of resources) {
    if (row.isNonSpam) nonSpam += 1;
    if (row.isBlogCommentCandidate) blogCommentResources += 1;
    if (row.noRegisterLikely && row.isNonSpam) noRegisterBlogComment += 1;
  }
  return {
    discovered: resources.length,
    analyzed: resources.length,
    blogCommentResources,
    queued: queue.length,
    nonSpam,
    noRegisterBlogComment
  };
}

function parseTimeToMs(value) {
  const n = Date.parse(value || "");
  return Number.isFinite(n) ? n : 0;
}

function dedupeResourcesKeepLatest(resources) {
  const bestByKey = new Map();
  for (const rawRow of resources) {
    const row = normalizeResourceRecord(rawRow);
    const key = `${row?.targetDomain || ""}|${row?.url || ""}`;
    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, row);
      continue;
    }
    const existingTs = Math.max(parseTimeToMs(existing.updatedAt), parseTimeToMs(existing.createdAt));
    const currentTs = Math.max(parseTimeToMs(row.updatedAt), parseTimeToMs(row.createdAt));
    if (currentTs >= existingTs) {
      bestByKey.set(key, row);
    }
  }
  const deduped = Array.from(bestByKey.values());
  deduped.sort((a, b) => {
    const ta = Math.max(parseTimeToMs(a.updatedAt), parseTimeToMs(a.createdAt));
    const tb = Math.max(parseTimeToMs(b.updatedAt), parseTimeToMs(b.createdAt));
    return tb - ta;
  });
  return deduped;
}

function safeText(value) {
  return String(value || "").trim();
}

function parseJsonFromModelText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeProductHuntDraft(input, targetUrl) {
  const topics = Array.isArray(input?.topics) ? input.topics.filter(Boolean).slice(0, 6) : [];
  let fallbackName = "";
  try {
    const u = new URL(targetUrl || "");
    fallbackName = u.hostname.replace(/^www\./, "").split(".")[0] || "";
  } catch {
    fallbackName = "";
  }
  return {
    name: safeText(input?.name || fallbackName).slice(0, 60),
    tagline: safeText(input?.tagline).slice(0, 120),
    description: safeText(input?.description).slice(0, 260),
    firstComment: safeText(input?.firstComment).slice(0, 400),
    topics
  };
}

async function generateProductHuntDraft(payload) {
  const db = await getDB();
  const config = db.publishConfig || DEFAULT_DB.publishConfig;
  const apiKey = safeText(config.openrouterApiKey);
  if (!apiKey) throw new Error("请先在固定URL发布页配置 OpenRouter API Key");

  const targetUrl = normalizeUrl(payload?.targetUrl || "");
  if (!targetUrl) throw new Error("目标 URL 格式不正确");
  const context = safeText(payload?.extraContext || "");

  const prompt = [
    "你是 Product Hunt 发布文案助手。",
    `目标 URL: ${targetUrl}`,
    context ? `补充信息: ${context}` : "",
    "请只返回 JSON 对象，字段必须包含：name, tagline, firstComment。",
    "要求：tagline 20-60 字符；firstComment 80-280 字符。",
    "不要包含 markdown，不要包含解释。"
  ]
    .filter(Boolean)
    .join("\n");

  const model = safeText(config.openrouterModel) || "google/gemini-2.0-flash-001";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://localhost/chrome-plugin-outlink",
      "X-Title": "Outlink Publisher"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenRouter 请求失败 (${response.status}) ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const json = parseJsonFromModelText(content);
  const draft = normalizeProductHuntDraft(json, targetUrl);
  if (!draft.tagline || !draft.firstComment) {
    throw new Error("模型返回数据不完整，请补充上下文后重试");
  }

  await appendLog(db, `生成 Product Hunt 文案：${targetUrl}`);
  await setDB(db);
  return draft;
}

async function openAndFillProductHunt(payload) {
  const db = await getDB();
  const targetUrl = normalizeUrl(payload?.targetUrl || "");
  if (!targetUrl) throw new Error("目标 URL 格式不正确");
  let draft = normalizeProductHuntDraft(payload?.draft || {}, targetUrl);
  if (!draft.tagline || !draft.firstComment) {
    draft = await generateProductHuntDraft({
      targetUrl,
      extraContext: payload?.extraContext || ""
    });
  }
  const autoSubmit = Boolean(payload?.autoSubmit ?? db.publishConfig?.autoSubmitProductHunt);
  const tab = await chrome.tabs.create({
    url: "https://www.producthunt.com/posts/new",
    active: true
  });
  db.publishState.productHuntPending = {
    tabId: tab.id,
    attempts: 0,
    lastStep: "",
    lastUrl: "",
    payload: {
      targetUrl,
      draft,
      autoSubmit
    },
    createdAt: new Date().toISOString()
  };
  db.tables.publish.unshift({
    id: crypto.randomUUID(),
    platform: "producthunt",
    targetUrl,
    status: "opening",
    createdAt: new Date().toISOString()
  });
  db.tables.publish = db.tables.publish.slice(0, 1000);
  await appendLog(db, `打开 Product Hunt 发布页：${targetUrl}`);
  await setDB(db);
  setTimeout(() => {
    trySendProductHuntAutofill(tab.id).catch(() => {});
  }, 1200);
  return { tabId: tab.id };
}

async function trySendProductHuntAutofill(tabId) {
  const perTickRetries = 8;
  for (let tick = 1; tick <= perTickRetries; tick += 1) {
    const db = await getDB();
    const pending = db.publishState?.productHuntPending;
    if (!pending || pending.tabId !== tabId) return;
    if ((pending.attempts || 0) > 40) {
      await appendLog(db, "Product Hunt 自动发布流程停止：超过最大重试次数", "error");
      db.publishState.productHuntPending = null;
      await setDB(db);
      return;
    }

    const resp = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          action: "PRODUCTHUNT_AUTOFILL",
          payload: pending.payload
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ __sendError: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || {});
        }
      );
    });

    if (resp?.__sendError) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    const latest = await getDB();
    const latestPending = latest.publishState?.productHuntPending;
    if (!latestPending || latestPending.tabId !== tabId) return;
    latestPending.attempts = (latestPending.attempts || 0) + 1;
    latestPending.lastStep = resp?.step || latestPending.lastStep || "";
    latestPending.lastUrl = resp?.url || latestPending.lastUrl || "";

    const row = latest.tables.publish.find((item) => item.platform === "producthunt" && item.targetUrl === latestPending.payload.targetUrl);
    if (row) {
      row.updatedAt = new Date().toISOString();
    }

    if (resp?.submitTried) {
      await appendLog(latest, "Product Hunt 已尝试点击发布按钮", "info");
      if (row) row.status = "submitted_try";
      latest.publishState.productHuntPending = null;
      await setDB(latest);
      return;
    }

    const success = Boolean(resp?.ok);
    if (success) {
      const msg = `Product Hunt 自动流转：step=${resp?.step || "unknown"}, filled=${resp?.filledCount ?? 0}, next=${resp?.nextClicked ? "yes" : "no"}`;
      await appendLog(latest, msg, "info");
      if (row) row.status = resp?.nextClicked ? "progressing" : "filled";
      await setDB(latest);

      if (!resp?.nextClicked && !latestPending.payload.autoSubmit) {
        latest.publishState.productHuntPending = null;
        await setDB(latest);
        return;
      }
      await new Promise((r) => setTimeout(r, 900));
      continue;
    }

    await appendLog(latest, `Product Hunt 自动填表失败: ${resp?.error || "unknown"}`, "error");
    if (row) row.status = "fill_failed";
    latest.publishState.productHuntPending = null;
    await setDB(latest);
    return;
  }
}

function normalizeBlogCommentDraft(input) {
  return {
    comment: safeText(input?.comment).slice(0, 800)
  };
}

async function generateBlogCommentDraft(payload) {
  const db = await getDB();
  const config = db.publishConfig || DEFAULT_DB.publishConfig;
  const apiKey = safeText(config.openrouterApiKey);
  if (!apiKey) throw new Error("请先配置 OpenRouter API Key");

  const targetUrl = normalizeUrl(payload?.targetUrl || config.blogWebsiteUrl || "");
  if (!targetUrl) throw new Error("要做外链的 URL 格式不正确");
  const blogPageUrl = normalizeUrl(payload?.blogPageUrl || "");
  const context = safeText(payload?.extraContext || "");
  const articleTitle = safeText(payload?.articleTitle || "");
  const articleText = safeText(payload?.articleText || "").slice(0, 4500);
  const commentSystem = safeText(payload?.commentSystem || "");

  const prompt = [
    "你是博客评论助手，目标是写一条自然、具体、不过度营销的评论。",
    `要引用的网站 URL: ${targetUrl}`,
    blogPageUrl ? `评论页面 URL: ${blogPageUrl}` : "",
    commentSystem ? `评论系统: ${commentSystem}` : "",
    articleTitle ? `文章标题: ${articleTitle}` : "",
    articleText ? `文章内容摘要: ${articleText}` : "",
    context ? `补充信息: ${context}` : "",
    "请只返回 JSON 对象，字段必须包含：comment。",
    "要求：comment 60-180 字；必须针对文章观点或细节回应；语气真实；不要堆关键词；不要承诺虚假体验；可以自然提到上面的 URL。",
    "不要包含 markdown，不要包含解释。"
  ]
    .filter(Boolean)
    .join("\n");

  const model = safeText(config.openrouterModel) || "google/gemini-2.0-flash-001";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://localhost/chrome-plugin-outlink",
      "X-Title": "Outlink Publisher"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.45
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenRouter 请求失败 (${response.status}) ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const draft = normalizeBlogCommentDraft(parseJsonFromModelText(content));
  if (!draft.comment) throw new Error("模型返回数据不完整，请补充上下文后重试");

  await appendLog(db, `生成博客评论：${targetUrl}`);
  await setDB(db);
  return draft;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0];
  if (!tab?.id) throw new Error("未找到当前活动页面");
  return tab;
}

async function sendMessageToFrame(tabId, frameId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, { frameId }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ __sendError: chrome.runtime.lastError.message, frameId });
        return;
      }
      resolve({ ...(response || {}), frameId });
    });
  });
}

async function sendBlogMessageToAllFrames(tabId, message) {
  let frames = [];
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId });
  } catch {
    frames = [{ frameId: 0 }];
  }
  const frameIds = [...new Set((frames || []).map((frame) => frame.frameId).filter((id) => typeof id === "number"))];
  const results = [];
  for (const frameId of frameIds.length ? frameIds : [0]) {
    results.push(await sendMessageToFrame(tabId, frameId, message));
  }
  return results.filter((item) => !item.__sendError);
}

function pickBestBlogFrameResponse(results) {
  return (
    results.find((item) => item.ok && item.system && item.system !== "unknown") ||
    results.find((item) => item.system && item.system !== "unknown") ||
    results.find((item) => item.ok) ||
    results[0] ||
    null
  );
}

async function captureTabScreenshot(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 50 });
  } catch {
    return "";
  }
}

async function recordBlogPublishEvent({ tabId, targetUrl, status, comment, system, submitTried, filledCount, error }) {
  const db = await getDB();
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const screenshotDataUrl = await captureTabScreenshot(tabId);
  db.tables.publish.unshift({
    id: crypto.randomUUID(),
    platform: "blog_comment",
    targetUrl: targetUrl || db.publishConfig?.blogWebsiteUrl || "",
    blogPageUrl: tab?.url || "",
    status,
    comment: safeText(comment || "").slice(0, 800),
    commentSystem: system || "",
    submitTried: Boolean(submitTried),
    filledCount: filledCount ?? null,
    screenshotDataUrl,
    error: error || "",
    createdAt: new Date().toISOString()
  });
  db.tables.publish = db.tables.publish.slice(0, 30);
  await appendLog(db, `博客评论发布记录：${status} ${tab?.url || ""}`, error ? "error" : "info");
  await setDB(db);
}

function getHostnameFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function checkPublishLinks() {
  const db = await getDB();
  const rows = (db.tables.publish || []).filter((row) => row.platform === "blog_comment" && row.blogPageUrl && row.targetUrl);
  let checked = 0;
  for (const row of rows.slice(0, 30)) {
    checked += 1;
    try {
      const response = await fetch(row.blogPageUrl, { method: "GET", credentials: "omit" });
      const html = await response.text();
      const targetHost = getHostnameFromUrl(row.targetUrl);
      const found = html.includes(row.targetUrl) || (targetHost && html.includes(targetHost));
      row.linkStatus = found ? "live" : "not_found";
      row.checkedAt = new Date().toISOString();
      row.updatedAt = row.checkedAt;
    } catch (error) {
      row.linkStatus = "check_failed";
      row.checkedAt = new Date().toISOString();
      row.error = error?.message || String(error);
    }
  }
  await appendLog(db, `链接存活检查完成：${checked} 条`);
  await setDB(db);
  return { checked };
}

async function inspectCurrentCommentPage() {
  const tab = await getActiveTab();
  const results = await sendBlogMessageToAllFrames(tab.id, { action: "BLOG_COMMENT_INSPECT" });
  const best = pickBestBlogFrameResponse(results);
  if (!best) throw new Error("当前页面未加载评论助手脚本，请刷新页面后重试");
  return {
    ...best,
    pageUrl: tab.url || best.url || "",
    tabId: tab.id
  };
}

async function generateCurrentPageBlogComment(payload) {
  const inspection = await inspectCurrentCommentPage();
  const article = inspection.article || {};
  const draft = await generateBlogCommentDraft({
    targetUrl: payload?.targetUrl || "",
    blogPageUrl: inspection.pageUrl || inspection.url || "",
    extraContext: payload?.extraContext || "",
    articleTitle: article.title || "",
    articleText: [article.metaDescription, article.text].filter(Boolean).join("\n"),
    commentSystem: inspection.system || ""
  });
  return { draft, inspection };
}

async function prefillCurrentPageBlogComment(payload) {
  const tab = await getActiveTab();
  const results = await sendBlogMessageToAllFrames(tab.id, {
    action: "BLOG_COMMENT_AUTOFILL",
    payload: {
      targetUrl: normalizeUrl(payload?.targetUrl || ""),
      authorName: safeText(payload?.authorName || ""),
      authorEmail: safeText(payload?.authorEmail || ""),
      comment: safeText(payload?.comment || ""),
      autoSubmit: false
    }
  });
  const best = pickBestBlogFrameResponse(results);
  if (!best?.ok) throw new Error(best?.error || "当前页面未找到可预填的评论表单");
  await recordBlogPublishEvent({
    tabId: tab.id,
    targetUrl: payload?.targetUrl || "",
    status: "filled_review",
    comment: payload?.comment || "",
    system: best.system,
    filledCount: best.filledCount
  });
  return best;
}

async function submitCurrentPageBlogComment(payload) {
  const tab = await getActiveTab();
  const results = await sendBlogMessageToAllFrames(tab.id, { action: "BLOG_COMMENT_SUBMIT" });
  const best = pickBestBlogFrameResponse(results);
  if (!best?.ok) {
    await recordBlogPublishEvent({
      tabId: tab.id,
      targetUrl: payload?.targetUrl || "",
      status: "submit_failed",
      comment: payload?.comment || "",
      system: best?.system || "",
      error: best?.error || "提交失败"
    });
    throw new Error(best?.error || "提交失败");
  }
  await recordBlogPublishEvent({
    tabId: tab.id,
    targetUrl: payload?.targetUrl || "",
    status: "submitted_try",
    comment: payload?.comment || "",
    system: best.system,
    submitTried: true
  });
  return best;
}

async function openAndFillBlogComment(payload) {
  const db = await getDB();
  const blogPageUrl = normalizeUrl(payload?.blogPageUrl || "");
  const targetUrl = normalizeUrl(payload?.targetUrl || db.publishConfig?.blogWebsiteUrl || "");
  if (!blogPageUrl) throw new Error("博客评论页 URL 格式不正确");
  if (!targetUrl) throw new Error("要做外链的 URL 格式不正确");

  let comment = safeText(payload?.comment || "");
  if (!comment) {
    const draft = await generateBlogCommentDraft({
      targetUrl,
      blogPageUrl,
      extraContext: payload?.extraContext || ""
    });
    comment = draft.comment;
  }

  const autoSubmit = Boolean(payload?.autoSubmit ?? db.publishConfig?.autoSubmitBlogComment);
  const tab = await chrome.tabs.create({ url: blogPageUrl, active: true });
  db.publishState.blogCommentPending = {
    tabId: tab.id,
    attempts: 0,
    payload: {
      targetUrl,
      authorName: safeText(payload?.authorName || db.publishConfig?.blogAuthorName || ""),
      authorEmail: safeText(payload?.authorEmail || db.publishConfig?.blogAuthorEmail || ""),
      comment,
      autoSubmit
    },
    createdAt: new Date().toISOString()
  };
  db.publishConfig = {
    ...DEFAULT_DB.publishConfig,
    ...(db.publishConfig || {}),
    blogAuthorName: safeText(payload?.authorName || db.publishConfig?.blogAuthorName || ""),
    blogAuthorEmail: safeText(payload?.authorEmail || db.publishConfig?.blogAuthorEmail || ""),
    blogWebsiteUrl: targetUrl,
    autoSubmitBlogComment: autoSubmit
  };
  db.tables.publish.unshift({
    id: crypto.randomUUID(),
    platform: "blog_comment",
    targetUrl,
    blogPageUrl,
    status: "opening",
    createdAt: new Date().toISOString()
  });
  db.tables.publish = db.tables.publish.slice(0, 1000);
  await appendLog(db, `打开博客评论页：${blogPageUrl}`);
  await setDB(db);
  setTimeout(() => {
    trySendBlogCommentAutofill(tab.id).catch(() => {});
  }, 1200);
  return { tabId: tab.id, comment };
}

async function trySendBlogCommentAutofill(tabId) {
  const perTickRetries = 8;
  for (let tick = 1; tick <= perTickRetries; tick += 1) {
    const db = await getDB();
    const pending = db.publishState?.blogCommentPending;
    if (!pending || pending.tabId !== tabId) return;
    if ((pending.attempts || 0) > 20) {
      await appendLog(db, "博客评论自动填写停止：超过最大重试次数", "error");
      db.publishState.blogCommentPending = null;
      await setDB(db);
      return;
    }

    const responses = await sendBlogMessageToAllFrames(tabId, {
      action: "BLOG_COMMENT_AUTOFILL",
      payload: pending.payload
    });
    const resp = pickBestBlogFrameResponse(responses) || { __sendError: "no response" };

    if (resp?.__sendError) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    const latest = await getDB();
    const latestPending = latest.publishState?.blogCommentPending;
    if (!latestPending || latestPending.tabId !== tabId) return;
    latestPending.attempts = (latestPending.attempts || 0) + 1;
    const row = latest.tables.publish.find(
      (item) => item.platform === "blog_comment" && item.targetUrl === latestPending.payload.targetUrl
    );
    if (row) row.updatedAt = new Date().toISOString();

    if (resp?.ok || resp?.submitTried) {
      await appendLog(
        latest,
        `博客评论自动填写：filled=${resp?.filledCount ?? 0}, submit=${resp?.submitTried ? "yes" : "no"}`,
        "info"
      );
      if (row) row.status = resp?.submitTried ? "submitted_try" : "filled";
      latest.publishState.blogCommentPending = null;
      await setDB(latest);
      await recordBlogPublishEvent({
        tabId,
        targetUrl: latestPending.payload.targetUrl,
        status: resp?.submitTried ? "submitted_try" : "filled_review",
        comment: latestPending.payload.comment,
        system: resp?.system,
        submitTried: resp?.submitTried,
        filledCount: resp?.filledCount
      });
      return;
    }

    await appendLog(latest, `博客评论自动填写失败: ${resp?.error || "unknown"}`, "error");
    if (row) row.status = "fill_failed";
    latest.publishState.blogCommentPending = null;
    await setDB(latest);
    await recordBlogPublishEvent({
      tabId,
      targetUrl: latestPending.payload.targetUrl,
      status: "fill_failed",
      comment: latestPending.payload.comment,
      system: resp?.system,
      error: resp?.error || "unknown"
    });
    return;
  }
}

async function startCollection(targetDomain) {
  const db = await getDB();
  db.tables.resources = dedupeResourcesKeepLatest(db.tables.resources);
  const domain = normalizeDomain(targetDomain);
  if (!domain) throw new Error("目标域名格式不正确");
  const batchId = crypto.randomUUID();

  db.collectionState = {
    targetDomain: domain,
    source: "ahrefs-backlink-checker",
    status: "collecting",
    batchId,
    startedAt: new Date().toISOString(),
    counts: {
      discovered: 0,
      analyzed: 0,
      blogCommentResources: 0,
      queued: 0,
      nonSpam: 0,
      noRegisterBlogComment: 0
    },
    queue: [],
    seenByUrl: {},
    recent: []
  };

  db.tables.collection.unshift({
    id: crypto.randomUUID(),
    batchId,
    targetDomain: domain,
    source: "ahrefs-backlink-checker",
    startedAt: db.collectionState.startedAt,
    status: "collecting"
  });
  db.tables.collection = db.tables.collection.slice(0, 300);
  await appendLog(db, `开始收集：${domain}`);
  await setDB(db);
  await chrome.tabs.create({ url: SOURCE_URLS.ahrefs(domain), active: true });
}

async function startSemrushCollection(competitorDomain) {
  const db = await getDB();
  db.tables.resources = dedupeResourcesKeepLatest(db.tables.resources);
  const domain = normalizeDomain(competitorDomain);
  if (!domain) throw new Error("竞品 URL 或域名格式不正确");
  const batchId = crypto.randomUUID();

  db.collectionState = {
    targetDomain: domain,
    source: "semrush-backlinks",
    status: "collecting",
    batchId,
    startedAt: new Date().toISOString(),
    counts: {
      discovered: 0,
      analyzed: 0,
      blogCommentResources: 0,
      queued: 0,
      nonSpam: 0,
      noRegisterBlogComment: 0
    },
    queue: [],
    seenByUrl: {},
    recent: []
  };

  db.tables.collection.unshift({
    id: crypto.randomUUID(),
    batchId,
    targetDomain: domain,
    source: "semrush-backlinks",
    startedAt: db.collectionState.startedAt,
    status: "collecting"
  });
  db.tables.collection = db.tables.collection.slice(0, 300);
  await appendLog(db, `开始 Semrush 竞品外链采集：${domain}`);
  await setDB(db);
  await chrome.tabs.create({ url: SOURCE_URLS.semrush(domain), active: true });
}

function normalizeIncomingItem(raw, source, targetDomain) {
  const directUrl = typeof raw === "string" ? raw : raw?.url || raw?.referringPage || raw?.sourceUrl || raw?.link;
  const url = normalizeUrl(directUrl);
  if (!url) return null;
  let domain = "";
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  if (!domain || domain === targetDomain) return null;
  if (domain.endsWith("ahrefs.com")) return null;
  if (domain.endsWith("semrush.com") || domain.endsWith("sem.3ue.co")) return null;

  const drRaw = raw?.dr ?? raw?.domainRating ?? raw?.domain_rank;
  const daRaw = raw?.da ?? raw?.domainAuthority ?? raw?.authorityScore ?? raw?.authority_score;
  const trafficRaw = raw?.traffic ?? raw?.organicTraffic ?? raw?.organic_traffic;
  const da = parseNumber(daRaw);
  const dr = parseNumber(drRaw) ?? da;

  return {
    url,
    domain,
    source,
    sourcePage: raw?.sourcePage || raw?.source || "",
    anchor: raw?.anchor || raw?.anchorText || "",
    dr,
    da,
    traffic: parseNumber(trafficRaw)
  };
}

async function upsertResourcesFromPayload(payload) {
  const db = await getDB();
  db.tables.resources = dedupeResourcesKeepLatest(db.tables.resources);
  const state = db.collectionState;
  if (state.status !== "collecting") return;

  const targetDomain = normalizeDomain(state.targetDomain);
  const source = payload.source || "unknown";
  const requestUrl = payload.requestUrl || "";
  const rawItems = Array.isArray(payload.candidateItems)
    ? payload.candidateItems
    : Array.isArray(payload.candidateUrls)
    ? payload.candidateUrls
    : [];

  let parsed = 0;
  let added = 0;
  let updated = 0;
  let addedNonSpam = 0;
  let addedNoRegister = 0;
  const existingByKey = new Map();
  for (const row of db.tables.resources) {
    const key = `${row.targetDomain || ""}|${row.url || ""}`;
    if (!existingByKey.has(key)) {
      existingByKey.set(key, row);
    }
  }

  for (const raw of rawItems) {
    const base = normalizeIncomingItem(raw, source, targetDomain);
    if (!base) continue;
    parsed += 1;
    if (state.seenByUrl[base.url]) continue;
    state.seenByUrl[base.url] = true;

    const spam = evaluateSpam(base);
    const blog = evaluateNoRegisterBlogComment(base);
    const meta = buildResourceMeta({
      targetDomain,
      url: base.url,
      isBlogComment: blog.isBlogComment,
      noRegisterLikely: blog.noRegisterLikely
    });
    const resource = {
      id: crypto.randomUUID(),
      batchId: state.batchId || "",
      targetDomain,
      url: base.url,
      domain: base.domain,
      source,
      sourcePage: base.sourcePage,
      anchor: base.anchor,
      dr: base.dr,
      da: base.da,
      traffic: base.traffic,
      raw: typeof raw?.raw === "string" ? raw.raw : "",
      spamScore: spam.spamScore,
      isNonSpam: spam.isNonSpam,
      nonSpamReason: spam.nonSpamReason,
      isBlogCommentCandidate: blog.isBlogComment,
      noRegisterLikely: blog.noRegisterLikely,
      noRegisterReason: blog.noRegisterReason,
      type: meta.type,
      discoveredFrom: meta.discoveredFrom,
      hasCaptcha: meta.hasCaptcha,
      linkStrategy: meta.linkStrategy,
      linkFormat: meta.linkFormat,
      hasUrlField: meta.hasUrlField,
      status: spam.isNonSpam ? "queued" : "filtered_spam",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const dedupeKey = `${targetDomain}|${base.url}`;
    const existingRow = existingByKey.get(dedupeKey);
    if (existingRow) {
      Object.assign(existingRow, {
        ...resource,
        id: existingRow.id || resource.id,
        createdAt: existingRow.createdAt || resource.createdAt
      });
      updated += 1;
    } else {
      db.tables.resources.unshift(resource);
      existingByKey.set(dedupeKey, resource);
      added += 1;
    }

    if (spam.isNonSpam) {
      addedNonSpam += 1;
      const queueExists = state.queue.some((item) => item.url === base.url);
      if (!queueExists) {
        state.queue.push({
          id: crypto.randomUUID(),
          resourceId: existingRow?.id || resource.id,
          url: resource.url,
          status: "queued",
          discoveredAt: new Date().toISOString()
        });
      }
    }
    if (spam.isNonSpam && blog.noRegisterLikely) addedNoRegister += 1;
  }

  db.tables.resources = dedupeResourcesKeepLatest(db.tables.resources).slice(0, 5000);
  state.counts = computeCounts(db.tables.resources, state.queue);
  state.recent.unshift({
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    source,
    requestUrl,
    extracted: rawItems.length,
    parsed,
    discovered: added,
    nonSpam: addedNonSpam,
    noRegisterBlogComment: addedNoRegister
  });
  state.recent = state.recent.slice(0, 100);

  if (rawItems.length > 0) {
    await appendLog(
      db,
      `[${source}] 收到 ${rawItems.length} 条，解析 ${parsed} 条，新增 ${added} 条，更新 ${updated} 条，非SPAM ${addedNonSpam} 条，免注册博客评论候选 ${addedNoRegister} 条`
    );
  }
  await setDB(db);
}

async function getResources(options = {}) {
  const db = await getDB();
  db.tables.resources = dedupeResourcesKeepLatest(db.tables.resources);
  await setDB(db);
  const { onlyNonSpam = false, onlyNoRegister = false, semrushPublishableOnly = false, limit = 200 } = options;
  let rows = db.tables.resources;
  if (onlyNonSpam) rows = rows.filter((row) => row.isNonSpam);
  if (onlyNoRegister) rows = rows.filter((row) => row.noRegisterLikely && row.isBlogCommentCandidate);
  if (semrushPublishableOnly) {
    rows = rows
      .filter((row) => String(row.source || "").includes("semrush"))
      .map((row) => ({
        ...row,
        ...classifySemrushPublishable(row)
      }))
      .filter((row) => row.semrushPublishable)
      .sort((a, b) => (b.da ?? b.dr ?? 0) - (a.da ?? a.dr ?? 0));
  }
  return rows.slice(0, Math.min(1000, Math.max(10, limit)));
}

async function importResourcesRows(rows) {
  const db = await getDB();
  const list = Array.isArray(rows) ? rows : [];
  const imported = [];
  for (const row of list) {
    const parsed = buildImportedResource(row);
    if (parsed) imported.push(parsed);
  }

  if (imported.length === 0) {
    return { imported: 0, total: db.tables.resources.length };
  }

  db.tables.resources = dedupeResourcesKeepLatest([...imported, ...db.tables.resources]).slice(0, 5000);
  await appendLog(db, `导入资源 ${imported.length} 条（JSON/XLSX）`);
  await setDB(db);
  return { imported: imported.length, total: db.tables.resources.length };
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const url = String(tab?.url || "");
  if (url.includes("producthunt.com/posts/new")) {
    await trySendProductHuntAutofill(tabId);
    return;
  }

  const db = await getDB();
  if (db.publishState?.blogCommentPending?.tabId === tabId) {
    await trySendBlogCommentAutofill(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const action = message?.action;

  if (action === "COLLECTION_START") {
    startCollection(message.targetDomain)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "SEMRUSH_COLLECTION_START") {
    startSemrushCollection(message.competitorDomain)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "COLLECTION_STOP") {
    getDB()
      .then(async (db) => {
        db.collectionState.status = "paused";
        await appendLog(db, "收集已暂停");
        await setDB(db);
        sendResponse({ ok: true });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "GET_COLLECTION_STATE") {
    getDB()
      .then((db) => sendResponse({ ok: true, state: buildStateSummary(db.collectionState) }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "GET_TABLE_COUNTS") {
    getDB()
      .then((db) =>
        sendResponse({
          ok: true,
          counts: {
            collection: db.tables.collection.length,
            publish: db.tables.publish.length,
            logs: db.tables.logs.length,
            resources: db.tables.resources.length
          }
        })
      )
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "GET_RESOURCES") {
    getResources(message.options || {})
      .then((rows) => sendResponse({ ok: true, rows }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "GET_PUBLISH_RECORDS") {
    getDB()
      .then((db) => sendResponse({ ok: true, rows: (db.tables.publish || []).slice(0, 100) }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "CHECK_PUBLISH_LINKS") {
    checkPublishLinks()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "NETWORK_BACKLINKS_PAYLOAD") {
    upsertResourcesFromPayload(message.payload || {})
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "RESET_DEMO_DATA") {
    setDB(structuredClone(DEFAULT_DB))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "GET_BACKUP_PAYLOAD") {
    getDB()
      .then((db) => sendResponse({ ok: true, backup: makeBackupPayload(db) }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "IMPORT_BACKUP_PAYLOAD") {
    const payload = message.payload;
    const imported = normalizeImportedDB(payload);
    imported.tables.resources = dedupeResourcesKeepLatest(imported.tables.resources);
    setDB(imported)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "IMPORT_RESOURCES_ROWS") {
    importResourcesRows(message.rows || [])
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "GET_PUBLISH_CONFIG") {
    getDB()
      .then((db) => sendResponse({ ok: true, config: db.publishConfig || DEFAULT_DB.publishConfig }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "SAVE_PUBLISH_CONFIG") {
    getDB()
      .then(async (db) => {
        db.publishConfig = {
          ...DEFAULT_DB.publishConfig,
          ...(db.publishConfig || {}),
          ...(message.config || {})
        };
        await appendLog(db, "发布配置已保存");
        await setDB(db);
        sendResponse({ ok: true, config: db.publishConfig });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "GENERATE_PRODUCTHUNT_DRAFT") {
    generateProductHuntDraft(message.payload || {})
      .then((draft) => sendResponse({ ok: true, draft }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "GENERATE_BLOG_COMMENT_DRAFT") {
    generateBlogCommentDraft(message.payload || {})
      .then((draft) => sendResponse({ ok: true, draft }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "INSPECT_CURRENT_COMMENT_PAGE") {
    inspectCurrentCommentPage()
      .then((inspection) => sendResponse({ ok: true, inspection }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "GENERATE_CURRENT_PAGE_BLOG_COMMENT") {
    generateCurrentPageBlogComment(message.payload || {})
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "PREFILL_CURRENT_PAGE_BLOG_COMMENT") {
    prefillCurrentPageBlogComment(message.payload || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "SUBMIT_CURRENT_PAGE_BLOG_COMMENT") {
    submitCurrentPageBlogComment(message.payload || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "OPEN_AND_FILL_PRODUCTHUNT") {
    openAndFillProductHunt(message.payload || {})
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (action === "OPEN_AND_FILL_BLOG_COMMENT") {
    openAndFillBlogComment(message.payload || {})
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  sendResponse({ ok: false, error: "未知 action" });
  return false;
});
