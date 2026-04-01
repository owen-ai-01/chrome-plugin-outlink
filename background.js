const DB_KEY = "outlink_db_v1";
const DEFAULT_DB = {
  tables: {
    collection: [],
    publish: [],
    logs: [],
    resources: []
  },
  collectionState: {
    targetDomain: "",
    source: "",
    status: "idle",
    startedAt: null,
    counts: {
      discovered: 0,
      analyzed: 0,
      blogCommentResources: 0,
      queued: 0
    },
    queue: [],
    seenByUrl: {},
    recent: []
  }
};

async function getDB() {
  const data = await chrome.storage.local.get(DB_KEY);
  return data[DB_KEY] || structuredClone(DEFAULT_DB);
}

async function setDB(db) {
  await chrome.storage.local.set({ [DB_KEY]: db });
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

function isLikelyBlogCommentResource(candidateUrl) {
  try {
    const url = new URL(candidateUrl);
    const joined = `${url.pathname} ${url.search}`.toLowerCase();
    const markers = [
      "comment",
      "replytocom",
      "disqus",
      "wp-comments",
      "blog",
      "post",
      "article",
      "leave-a-reply"
    ];
    return markers.some((item) => joined.includes(item));
  } catch {
    return false;
  }
}

function semrushBacklinkUrl(domain) {
  return `https://www.semrush.com/analytics/backlinks/overview/?searchType=domain&q=${encodeURIComponent(domain)}`;
}

function ahrefsBacklinkUrl(domain) {
  return `https://app.ahrefs.com/v2-site-explorer/overview?target=${encodeURIComponent(domain)}`;
}

async function appendLog(db, message, level = "info") {
  const row = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    level,
    message
  };
  db.tables.logs.unshift(row);
  db.tables.logs = db.tables.logs.slice(0, 800);
}

function buildStateSummary(state) {
  return {
    targetDomain: state.targetDomain,
    source: state.source,
    status: state.status,
    startedAt: state.startedAt,
    counts: state.counts,
    recent: state.recent.slice(0, 20)
  };
}

async function startCollection(targetDomain) {
  const db = await getDB();
  const domain = normalizeDomain(targetDomain);
  if (!domain) {
    throw new Error("目标域名格式不正确");
  }

  db.collectionState = {
    targetDomain: domain,
    source: "semrush+ahrefs",
    status: "collecting",
    startedAt: new Date().toISOString(),
    counts: {
      discovered: 0,
      analyzed: 0,
      blogCommentResources: 0,
      queued: 0
    },
    queue: [],
    seenByUrl: {},
    recent: []
  };

  db.tables.collection.unshift({
    id: crypto.randomUUID(),
    targetDomain: domain,
    startedAt: db.collectionState.startedAt,
    status: "collecting"
  });
  db.tables.collection = db.tables.collection.slice(0, 200);

  await appendLog(db, `开始收集：${domain}`);
  await setDB(db);

  await chrome.tabs.create({ url: semrushBacklinkUrl(domain), active: true });
  await chrome.tabs.create({ url: ahrefsBacklinkUrl(domain), active: false });
}

async function upsertResourcesFromPayload(payload) {
  const db = await getDB();
  const state = db.collectionState;
  if (state.status !== "collecting") return;

  const targetDomain = normalizeDomain(state.targetDomain);
  const source = payload.source || "unknown";
  const requestUrl = payload.requestUrl || "";
  const list = Array.isArray(payload.candidateUrls) ? payload.candidateUrls : [];

  let added = 0;
  let addedBlog = 0;

  for (const raw of list) {
    const normalized = normalizeUrl(raw);
    if (!normalized) continue;

    let hostname = "";
    try {
      hostname = new URL(normalized).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (!hostname || hostname === targetDomain) continue;
    if (hostname.endsWith("semrush.com") || hostname.endsWith("ahrefs.com")) continue;
    if (state.seenByUrl[normalized]) continue;

    const isBlog = isLikelyBlogCommentResource(normalized);
    state.seenByUrl[normalized] = true;
    state.queue.push({
      id: crypto.randomUUID(),
      url: normalized,
      source,
      discoveredAt: new Date().toISOString(),
      status: "queued",
      isBlogComment: isBlog
    });
    added += 1;
    if (isBlog) addedBlog += 1;

    db.tables.resources.unshift({
      id: crypto.randomUUID(),
      url: normalized,
      source,
      resourceType: isBlog ? "blog_comment" : "generic_backlink",
      status: "queued",
      createdAt: new Date().toISOString()
    });
  }

  state.counts.analyzed += list.length;
  state.counts.discovered += added;
  state.counts.blogCommentResources += addedBlog;
  state.counts.queued = state.queue.length;

  state.recent.unshift({
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    source,
    requestUrl,
    extracted: list.length,
    discovered: added,
    blogComment: addedBlog
  });
  state.recent = state.recent.slice(0, 50);

  if (added > 0) {
    await appendLog(
      db,
      `[${source}] 分析请求完成，解析 ${list.length} 条，新增 ${added} 条候选，博客评论资源 ${addedBlog} 条`
    );
  }
  await setDB(db);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const action = message?.action;

  if (action === "COLLECTION_START") {
    startCollection(message.targetDomain)
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

  sendResponse({ ok: false, error: "未知 action" });
  return false;
});
