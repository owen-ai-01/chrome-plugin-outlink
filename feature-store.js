const FEATURE_KEY = "outlink_features_v1";
const DB_KEY = "outlink_db_v2";

function makeDefaultTemplates() {
  const openings = [
    "Thanks for explaining this so clearly.", "This was a useful breakdown.", "I appreciated the practical detail here.",
    "This article clarified an important point.", "The examples made this easy to follow.", "This is a thoughtful overview.",
    "I found the comparison especially helpful.", "This gave me a better way to think about the topic.",
    "The step-by-step explanation was valuable.", "There are several useful takeaways here."
  ];
  const closings = [
    "The point about {keyword} was especially relevant.", "I will keep this in mind when working on {keyword}.",
    "The section on practical trade-offs stood out to me.", "It would be interesting to see a follow-up with more examples.",
    "This adds useful context for anyone researching {keyword}."
  ];
  const rows = [];
  let index = 1;
  for (const opening of openings) {
    for (const closing of closings) {
      rows.push({ id: `default-${index}`, name: `English ${index}`, language: "en", content: `${opening} ${closing}`, builtIn: true });
      index += 1;
    }
  }
  return rows;
}

const DEFAULT_FEATURES = {
  targetSites: [],
  templates: makeDefaultTemplates(),
  queue: [],
  settings: {
    delaySeconds: 20,
    randomDelaySeconds: 20,
    dailyLimit: 20,
    perDomainLimit: 1,
    blacklist: [],
    whitelist: [],
    sheetEndpointUrl: "",
    sheetName: "Resources",
    scheduleEnabled: false,
    scheduleHours: 24,
    scheduledDomains: []
  },
  dailyUsage: {}
};

async function getFeatures() {
  const stored = (await chrome.storage.local.get(FEATURE_KEY))[FEATURE_KEY] || {};
  return {
    ...structuredClone(DEFAULT_FEATURES),
    ...stored,
    targetSites: Array.isArray(stored.targetSites) ? stored.targetSites : [],
    templates: Array.isArray(stored.templates) && stored.templates.length ? stored.templates : makeDefaultTemplates(),
    queue: Array.isArray(stored.queue) ? stored.queue : [],
    settings: { ...DEFAULT_FEATURES.settings, ...(stored.settings || {}) },
    dailyUsage: stored.dailyUsage && typeof stored.dailyUsage === "object" ? stored.dailyUsage : {}
  };
}

async function saveFeatures(value) {
  await chrome.storage.local.set({ [FEATURE_KEY]: value });
}

function validUrl(value) {
  try { return new URL(value).toString(); } catch { return ""; }
}

function domainOf(value) {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getMainDB() {
  return (await chrome.storage.local.get(DB_KEY))[DB_KEY] || { tables: { resources: [], publish: [], logs: [], collection: [] } };
}

async function saveMainDB(db) {
  await chrome.storage.local.set({ [DB_KEY]: db });
}

function respond(promise, sendResponse) {
  promise.then((data) => sendResponse({ ok: true, ...data })).catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const action = message?.action || "";
  if (!action.startsWith("FEATURE_")) return false;

  if (action === "FEATURE_GET_ALL") {
    respond(getFeatures().then((features) => ({ features })), sendResponse);
    return true;
  }

  if (action === "FEATURE_SAVE_SITE") {
    respond((async () => {
      const features = await getFeatures();
      const input = message.site || {};
      const url = validUrl(input.url || "");
      if (!url) throw new Error("推广网站 URL 不正确");
      const now = new Date().toISOString();
      const site = {
        id: input.id || crypto.randomUUID(), name: String(input.name || domainOf(url)).trim(), url,
        keyword: String(input.keyword || "").trim(), authorName: String(input.authorName || "").trim(),
        authorEmail: String(input.authorEmail || "").trim(), language: String(input.language || "auto"),
        createdAt: input.createdAt || now, updatedAt: now
      };
      const index = features.targetSites.findIndex((row) => row.id === site.id);
      if (index >= 0) features.targetSites[index] = site; else features.targetSites.unshift(site);
      await saveFeatures(features);
      return { site, features };
    })(), sendResponse);
    return true;
  }

  if (action === "FEATURE_DELETE_SITE") {
    respond((async () => {
      const features = await getFeatures();
      features.targetSites = features.targetSites.filter((row) => row.id !== message.id);
      features.queue = features.queue.filter((row) => row.siteId !== message.id);
      await saveFeatures(features);
      return { features };
    })(), sendResponse);
    return true;
  }

  if (action === "FEATURE_SAVE_TEMPLATE") {
    respond((async () => {
      const features = await getFeatures();
      const input = message.template || {};
      if (!String(input.content || "").trim()) throw new Error("模板内容不能为空");
      const template = { id: input.id || crypto.randomUUID(), name: String(input.name || "自定义模板").trim(), language: input.language || "auto", content: String(input.content).trim(), builtIn: false };
      const index = features.templates.findIndex((row) => row.id === template.id);
      if (index >= 0) features.templates[index] = template; else features.templates.unshift(template);
      await saveFeatures(features);
      return { template, features };
    })(), sendResponse);
    return true;
  }

  if (action === "FEATURE_DELETE_TEMPLATE") {
    respond((async () => {
      const features = await getFeatures();
      const found = features.templates.find((row) => row.id === message.id);
      if (found?.builtIn) throw new Error("内置模板不能删除");
      features.templates = features.templates.filter((row) => row.id !== message.id);
      await saveFeatures(features);
      return { features };
    })(), sendResponse);
    return true;
  }

  if (action === "FEATURE_SAVE_SETTINGS") {
    respond((async () => {
      const features = await getFeatures();
      const input = message.settings || {};
      const list = (value) => String(value || "").split(/[\n,]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
      features.settings = {
        ...features.settings,
        delaySeconds: Math.max(5, Number(input.delaySeconds) || 20),
        randomDelaySeconds: Math.max(0, Number(input.randomDelaySeconds) || 0),
        dailyLimit: Math.max(1, Number(input.dailyLimit) || 20),
        perDomainLimit: Math.max(1, Number(input.perDomainLimit) || 1),
        blacklist: list(input.blacklist), whitelist: list(input.whitelist),
        sheetEndpointUrl: String(input.sheetEndpointUrl || "").trim(), sheetName: String(input.sheetName || "Resources").trim(),
        scheduleEnabled: Boolean(input.scheduleEnabled), scheduleHours: Math.max(1, Number(input.scheduleHours) || 24), scheduledDomains: list(input.scheduledDomains)
      };
      await saveFeatures(features);
      await chrome.alarms.clear("outlink-scheduled-collection");
      if (features.settings.scheduleEnabled && features.settings.scheduledDomains.length) {
        await chrome.alarms.create("outlink-scheduled-collection", { periodInMinutes: features.settings.scheduleHours * 60 });
      }
      return { features };
    })(), sendResponse);
    return true;
  }

  if (action === "FEATURE_RESOURCE_MUTATE") {
    respond((async () => {
      const db = await getMainDB();
      const ids = new Set(Array.isArray(message.ids) ? message.ids : []);
      if (message.operation === "delete") db.tables.resources = (db.tables.resources || []).filter((row) => !ids.has(row.id));
      else for (const row of db.tables.resources || []) if (ids.has(row.id)) Object.assign(row, message.patch || {}, { updatedAt: new Date().toISOString() });
      await saveMainDB(db);
      return { affected: ids.size };
    })(), sendResponse);
    return true;
  }

  if (action === "FEATURE_QUEUE_CREATE") {
    respond((async () => {
      const features = await getFeatures();
      const db = await getMainDB();
      const site = features.targetSites.find((row) => row.id === message.siteId);
      if (!site) throw new Error("请先选择推广网站");
      const selected = new Set(Array.isArray(message.resourceIds) ? message.resourceIds : []);
      const published = new Set((db.tables.publish || []).filter((row) => row.targetSiteId === site.id).map((row) => row.resourceId).filter(Boolean));
      const domainCounts = {};
      const existing = new Set(features.queue.map((row) => `${row.siteId}|${row.resourceId}`));
      let added = 0;
      const today = todayKey();
      const usedToday = Number(features.dailyUsage[today] || 0);
      const allowed = Math.max(0, features.settings.dailyLimit - usedToday - features.queue.filter((row) => row.status === "pending" && String(row.createdAt || "").startsWith(today)).length);
      for (const resource of db.tables.resources || []) {
        if (selected.size && !selected.has(resource.id)) continue;
        if (!resource.isNonSpam || published.has(resource.id)) continue;
        const domain = resource.domain || domainOf(resource.url);
        if (features.settings.blacklist.some((item) => domain === item || domain.endsWith(`.${item}`))) continue;
        if (features.settings.whitelist.length && !features.settings.whitelist.some((item) => domain === item || domain.endsWith(`.${item}`))) continue;
        domainCounts[domain] = domainCounts[domain] || 0;
        if (domainCounts[domain] >= features.settings.perDomainLimit) continue;
        const key = `${site.id}|${resource.id}`;
        if (existing.has(key)) continue;
        domainCounts[domain] += 1;
        existing.add(key);
        if (added >= allowed) break;
        features.queue.push({ id: crypto.randomUUID(), siteId: site.id, resourceId: resource.id, url: resource.url, domain, status: "pending", attempts: 0, createdAt: new Date().toISOString() });
        added += 1;
      }
      await saveFeatures(features);
      return { added, features };
    })(), sendResponse);
    return true;
  }

  if (action === "FEATURE_QUEUE_UPDATE") {
    respond((async () => {
      const features = await getFeatures();
      const row = features.queue.find((item) => item.id === message.id);
      if (!row) throw new Error("任务不存在");
      const wasDone = row.status === "done";
      Object.assign(row, message.patch || {}, { updatedAt: new Date().toISOString() });
      if (!wasDone && row.status === "done") {
        const today = todayKey();
        features.dailyUsage[today] = Number(features.dailyUsage[today] || 0) + 1;
      }
      await saveFeatures(features);
      return { features };
    })(), sendResponse);
    return true;
  }

  if (action === "FEATURE_GET_STATS") {
    respond((async () => {
      const [features, db] = await Promise.all([getFeatures(), getMainDB()]);
      const resources = db.tables.resources || [];
      const publish = db.tables.publish || [];
      const byStatus = {};
      for (const row of publish) byStatus[row.status || "unknown"] = (byStatus[row.status || "unknown"] || 0) + 1;
      return { stats: { resources: resources.length, nonSpam: resources.filter((x) => x.isNonSpam).length, blogCandidates: resources.filter((x) => x.isBlogCommentCandidate).length, queuePending: features.queue.filter((x) => x.status === "pending").length, published: publish.length, byStatus, follow: resources.filter((x) => /(^|\b)dofollow|^follow$/i.test(x.linkType || "")).length, nofollow: resources.filter((x) => /nofollow|ugc/i.test(x.linkType || "")).length, dr: { low: resources.filter((x) => Number(x.dr || x.da || 0) < 10).length, medium: resources.filter((x) => Number(x.dr || x.da || 0) >= 10 && Number(x.dr || x.da || 0) < 40).length, high: resources.filter((x) => Number(x.dr || x.da || 0) >= 40).length } } };
    })(), sendResponse);
    return true;
  }

  if (action === "FEATURE_SHEETS_SYNC") {
    respond((async () => {
      const features = await getFeatures();
      const endpoint = validUrl(features.settings.sheetEndpointUrl);
      if (!endpoint || !endpoint.startsWith("https://")) throw new Error("请先配置 HTTPS Google Apps Script Web App URL");
      const db = await getMainDB();
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "sync", sheetName: features.settings.sheetName, resources: db.tables.resources || [], publish: db.tables.publish || [], targetSites: features.targetSites, exportedAt: new Date().toISOString() }) });
      if (!response.ok) throw new Error(`同步失败 HTTP ${response.status}`);
      const result = await response.json().catch(() => ({}));
      return { result };
    })(), sendResponse);
    return true;
  }

  respond(Promise.reject(new Error("未知扩展功能 action")), sendResponse);
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "outlink-scheduled-collection") return;
  const features = await getFeatures();
  const domains = features.settings.scheduledDomains || [];
  if (!features.settings.scheduleEnabled || !domains.length) return;
  const domain = domains[Math.floor(Date.now() / 3600000) % domains.length];
  const db = await getMainDB();
  db.collectionState = { ...(db.collectionState || {}), targetDomain: domain, source: "ahrefs-backlink-checker", status: "collecting", batchId: crypto.randomUUID(), startedAt: new Date().toISOString(), counts: { discovered: 0, analyzed: 0, blogCommentResources: 0, queued: 0, nonSpam: 0, noRegisterBlogComment: 0 }, queue: [], seenByUrl: {}, recent: [] };
  await saveMainDB(db);
  await chrome.tabs.create({ url: `https://ahrefs.com/backlink-checker/?input=${encodeURIComponent(domain)}&mode=subdomains`, active: false });
});
