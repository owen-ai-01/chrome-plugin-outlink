const tabs = Array.from(document.querySelectorAll(".tab"));
const panels = Array.from(document.querySelectorAll(".panel"));
const startBtn = document.getElementById("startCollectBtn");
const stopBtn = document.getElementById("stopCollectBtn");
const resetBtn = document.getElementById("resetBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const exportXlsxBtn = document.getElementById("exportXlsxBtn");
const importBtn = document.getElementById("importBtn");
const importFileInput = document.getElementById("importFileInput");
const domainInput = document.getElementById("targetDomainInput");

const badgeCollection = document.getElementById("badge-collection");
const badgePublish = document.getElementById("badge-publish");
const badgeLogs = document.getElementById("badge-logs");
const badgeResources = document.getElementById("badge-resources");
const refreshPublishRecordsBtn = document.getElementById("refreshPublishRecordsBtn");
const checkPublishLinksBtn = document.getElementById("checkPublishLinksBtn");
const publishRecordsTbody = document.getElementById("publishRecordsTbody");

const statDiscovered = document.getElementById("statDiscovered");
const statAnalyzed = document.getElementById("statAnalyzed");
const statBlogComment = document.getElementById("statBlogComment");
const statQueued = document.getElementById("statQueued");
const statNonSpam = document.getElementById("statNonSpam");
const statNoRegister = document.getElementById("statNoRegister");
const collectionStatus = document.getElementById("collectionStatus");
const collectionTarget = document.getElementById("collectionTarget");

const resourceTbody = document.getElementById("resourceTbody");
const resourcesTabTbody = document.getElementById("resourcesTabTbody");
const filterNonSpam = document.getElementById("filterNonSpam");
const filterNoRegister = document.getElementById("filterNoRegister");
const resourceFilterNonSpam = document.getElementById("resourceFilterNonSpam");
const resourceFilterNoRegister = document.getElementById("resourceFilterNoRegister");
const openAhrefs = document.getElementById("openAhrefs");
const openrouterKeyInput = document.getElementById("openrouterKeyInput");
const openrouterModelInput = document.getElementById("openrouterModelInput");
const autoSubmitProducthunt = document.getElementById("autoSubmitProducthunt");
const savePublishConfigBtn = document.getElementById("savePublishConfigBtn");
const phTargetUrlInput = document.getElementById("phTargetUrlInput");
const phExtraContextInput = document.getElementById("phExtraContextInput");
const generatePhDraftBtn = document.getElementById("generatePhDraftBtn");
const publishToPhBtn = document.getElementById("publishToPhBtn");
const phNameInput = document.getElementById("phNameInput");
const phTaglineInput = document.getElementById("phTaglineInput");
const phDescInput = document.getElementById("phDescInput");
const phCommentInput = document.getElementById("phCommentInput");
const phTopicsInput = document.getElementById("phTopicsInput");
const blogTargetUrlInput = document.getElementById("blogTargetUrlInput");
const blogSiteNameInput = document.getElementById("blogSiteNameInput");
const blogKeywordInput = document.getElementById("blogKeywordInput");
const blogAuthorNameInput = document.getElementById("blogAuthorNameInput");
const blogAuthorEmailInput = document.getElementById("blogAuthorEmailInput");
const blogExtraContextInput = document.getElementById("blogExtraContextInput");
const blogCommentInput = document.getElementById("blogCommentInput");
const blogFallbackCommentInput = document.getElementById("blogFallbackCommentInput");
const autoSubmitBlogComment = document.getElementById("autoSubmitBlogComment");
const saveBlogConfigBtn = document.getElementById("saveBlogConfigBtn");
const generateBlogCommentBtn = document.getElementById("generateBlogCommentBtn");
const blogPageUrlInput = document.getElementById("blogPageUrlInput");
const openBlogCommentBtn = document.getElementById("openBlogCommentBtn");
const refreshBlogCandidatesBtn = document.getElementById("refreshBlogCandidatesBtn");
const blogAutoTbody = document.getElementById("blogAutoTbody");
const currentCommentSystem = document.getElementById("currentCommentSystem");
const inspectCurrentCommentBtn = document.getElementById("inspectCurrentCommentBtn");
const generateCurrentCommentBtn = document.getElementById("generateCurrentCommentBtn");
const prefillCurrentCommentBtn = document.getElementById("prefillCurrentCommentBtn");
const submitCurrentCommentBtn = document.getElementById("submitCurrentCommentBtn");
const semrushCompetitorInput = document.getElementById("semrushCompetitorInput");
const openSemrushBacklinksBtn = document.getElementById("openSemrushBacklinksBtn");
const refreshSemrushListBtn = document.getElementById("refreshSemrushListBtn");
const semrushListStatus = document.getElementById("semrushListStatus");
const semrushAutoTbody = document.getElementById("semrushAutoTbody");
const refreshLogsBtn = document.getElementById("refreshLogsBtn");
const logsList = document.getElementById("logsList");

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

function ahrefsBacklinkUrl(domain) {
  return `https://ahrefs.com/backlink-checker/?input=${encodeURIComponent(domain)}&mode=subdomains`;
}

function parseTopics(input) {
  return String(input || "")
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).toString();
  } catch {
    return "";
  }
}

async function sendMessage(action, payload = {}) {
  return chrome.runtime.sendMessage({ action, ...payload });
}

function escapeCell(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  if (raw.includes("\t") || raw.includes("\n") || raw.includes('"')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function buildCsvRows(rows) {
  const headers = [
    "Type",
    "URL",
    "Domain",
    "Discovered From",
    "Has Captcha",
    "Link Strategy",
    "Link Format",
    "Has URL Field",
    "DR",
    "Traffic",
    "SPAM",
    "博客评论",
    "免注册候选"
  ];
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    const line = [
      row.type || "",
      row.url || "",
      row.domain || "",
      row.discoveredFrom || `ahrefs:${row.targetDomain || ""}`,
      row.hasCaptcha || "unknown",
      row.linkStrategy || "unknown",
      row.linkFormat || "unknown",
      row.hasUrlField || "unknown",
      row.dr ?? "",
      row.traffic ?? "",
      row.spamScore ?? "",
      row.isBlogCommentCandidate ? "Yes" : "No",
      row.noRegisterLikely && row.isNonSpam ? "Yes" : "No"
    ]
      .map(escapeCell)
      .join(",");
    lines.push(line);
  }
  return `\uFEFF${lines.join("\n")}`;
}

function downloadTextFile(fileName, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function parseDelimitedLine(line, delimiter) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      result.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current);
  return result;
}

function normalizeHeaderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/_/g, " ");
}

function parseRowsFromTabularText(text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const allRows = lines.map((line) => parseDelimitedLine(line, delimiter));
  const knownHeaders = {
    type: "type",
    url: "url",
    domain: "domain",
    "discovered from": "discoveredFrom",
    "has captcha": "hasCaptcha",
    "link strategy": "linkStrategy",
    "link format": "linkFormat",
    "has url field": "hasUrlField",
    dr: "dr",
    traffic: "traffic",
    spam: "spamScore",
    "博客评论": "isBlogCommentCandidate",
    "免注册候选": "noRegisterLikely",
    "目标域名": "targetDomain"
  };
  const firstRowHeaders = allRows[0].map(normalizeHeaderKey);
  const inferHeader = (header) => {
    if (knownHeaders[header]) return knownHeaders[header];
    if (/url|link|外链|链接/.test(header)) return "url";
    if (/anchor|锚文本/.test(header)) return "anchor";
    if (/domain rating|authority score|\bdr\b|\bda\b|域名权重/.test(header)) return "dr";
    if (/traffic|流量/.test(header)) return "traffic";
    if (/first seen|首次发现/.test(header)) return "firstSeen";
    if (/last seen|最后检测/.test(header)) return "lastSeen";
    if (/link type|链接类型/.test(header)) return "linkType";
    return null;
  };
  const headerMatches = firstRowHeaders.filter((h) => inferHeader(h)).length;
  const hasHeader = headerMatches >= 2;

  const defaultOrder = [
    "type",
    "url",
    "domain",
    "discoveredFrom",
    "hasCaptcha",
    "linkStrategy",
    "linkFormat",
    "hasUrlField",
    "dr",
    "traffic",
    "spamScore",
    "isBlogCommentCandidate",
    "noRegisterLikely"
  ];

  const mapping = hasHeader
    ? allRows[0].map((h) => inferHeader(normalizeHeaderKey(h)))
    : defaultOrder;
  const startIndex = hasHeader ? 1 : 0;
  const rows = [];

  for (let i = startIndex; i < allRows.length; i += 1) {
    const cols = allRows[i];
    const obj = {};
    for (let c = 0; c < cols.length; c += 1) {
      const key = mapping[c];
      if (!key) continue;
      obj[key] = cols[c];
    }
    if (obj.url || obj.URL) rows.push(obj);
  }
  return rows;
}

function activateTab(tabName) {
  for (const tab of tabs) {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  }
  for (const panel of panels) {
    panel.classList.toggle("active", panel.id === `panel-${tabName}`);
  }
}

async function refreshCounts() {
  const result = await sendMessage("GET_TABLE_COUNTS");
  if (!result?.ok) return;
  badgeCollection.textContent = String(result.counts.collection);
  badgePublish.textContent = String(result.counts.publish);
  badgeLogs.textContent = String(result.counts.logs);
  badgeResources.textContent = String(result.counts.resources);
}

async function refreshCollectionState() {
  const result = await sendMessage("GET_COLLECTION_STATE");
  if (!result?.ok) return;
  const state = result.state;
  if (!domainInput.value && state.targetDomain) domainInput.value = state.targetDomain;
  statDiscovered.textContent = String(state.counts.discovered || 0);
  statAnalyzed.textContent = String(state.counts.analyzed || 0);
  statBlogComment.textContent = String(state.counts.blogCommentResources || 0);
  statQueued.textContent = String(state.counts.queued || 0);
  statNonSpam.textContent = String(state.counts.nonSpam || 0);
  statNoRegister.textContent = String(state.counts.noRegisterBlogComment || 0);
  collectionStatus.textContent = `状态：${state.status || "-"}`;
  collectionTarget.textContent = `目标域名：${state.targetDomain || "-"}`;
}

async function refreshPublishConfig() {
  const result = await sendMessage("GET_PUBLISH_CONFIG");
  if (!result?.ok) return;
  const config = result.config || {};
  if (openrouterKeyInput) openrouterKeyInput.value = config.openrouterApiKey || "";
  if (openrouterModelInput) openrouterModelInput.value = config.openrouterModel || "google/gemini-2.0-flash-001";
  if (autoSubmitProducthunt) autoSubmitProducthunt.checked = Boolean(config.autoSubmitProductHunt);
  if (blogAuthorNameInput) blogAuthorNameInput.value = config.blogAuthorName || "";
  if (blogAuthorEmailInput) blogAuthorEmailInput.value = config.blogAuthorEmail || "";
  if (blogTargetUrlInput) blogTargetUrlInput.value = config.blogWebsiteUrl || "";
  if (blogSiteNameInput) blogSiteNameInput.value = config.blogSiteName || "";
  if (blogKeywordInput) blogKeywordInput.value = config.blogKeyword || "";
  if (autoSubmitBlogComment) autoSubmitBlogComment.checked = Boolean(config.autoSubmitBlogComment);
  if (blogFallbackCommentInput) blogFallbackCommentInput.value = config.blogFallbackComment || "";
}

function cellStatus(value) {
  return value ? '<span class="status-yes">是</span>' : '<span class="status-no">否</span>';
}

function renderRowsToTbody(rows, tbody) {
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="17">暂无数据，先点击“开始收集”。</td></tr>`;
    return;
  }

  for (const row of rows) {
    const discoveredFrom = row.discoveredFrom || `ahrefs:${row.targetDomain || "-"}`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.type || "-"}</td>
      <td class="url"><a href="${row.url}" target="_blank">${row.url}</a></td>
      <td>${row.domain || "-"}</td>
      <td>${discoveredFrom}</td>
      <td>${row.hasCaptcha || "unknown"}</td>
      <td>${row.linkStrategy || "unknown"}</td>
      <td>${row.linkFormat || "unknown"}</td>
      <td>${row.hasUrlField || "unknown"}</td>
      <td>${row.dr ?? "-"}</td>
      <td>${row.pageScore ?? "-"}</td>
      <td>${row.linkType || "unknown"}</td>
      <td>${row.traffic ?? "-"}</td>
      <td>${row.firstSeen || "-"}</td>
      <td>${row.lastSeen || "-"}</td>
      <td>${row.spamScore ?? "-"}</td>
      <td>${cellStatus(row.isBlogCommentCandidate)}</td>
      <td title="${row.noRegisterReason || ""}">${cellStatus(row.noRegisterLikely && row.isNonSpam)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderBlogAutoRows(rows) {
  if (!blogAutoTbody) return;
  blogAutoTbody.innerHTML = "";
  if (!rows || rows.length === 0) {
    blogAutoTbody.innerHTML = `<tr><td colspan="7">暂无免注册博客评论候选，先在“收集”里抓取资源。</td></tr>`;
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="url"><a href="${row.url}" target="_blank">${row.url}</a></td>
      <td>${row.domain || "-"}</td>
      <td>${row.dr ?? "-"}</td>
      <td>${row.traffic ?? "-"}</td>
      <td>${row.spamScore ?? "-"}</td>
      <td>${row.noRegisterReason || "-"}</td>
      <td><button class="secondary" data-blog-url="${row.url}">打开写评论</button></td>
    `;
    blogAutoTbody.appendChild(tr);
  }
}

function renderSemrushAutoRows(rows) {
  if (!semrushAutoTbody) return;
  semrushAutoTbody.innerHTML = "";
  if (!rows || rows.length === 0) {
    semrushAutoTbody.innerHTML = `<tr><td colspan="7">暂无 Semrush 待发清单，先输入竞品域名并打开采集。</td></tr>`;
    if (semrushListStatus) semrushListStatus.textContent = "待发清单：0 条";
    return;
  }

  if (semrushListStatus) semrushListStatus.textContent = `待发清单：${rows.length} 条，已按 DA 从高到低排序。`;
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="url"><a href="${row.url}" target="_blank">${row.url}</a></td>
      <td>${row.domain || "-"}</td>
      <td>${row.da ?? row.dr ?? "-"}</td>
      <td>${row.traffic ?? "-"}</td>
      <td>${row.publishableType || row.type || "-"}</td>
      <td>${row.publishableReason || row.noRegisterReason || "-"}</td>
      <td><button class="secondary" data-semrush-url="${row.url}">智能填表发布</button></td>
    `;
    semrushAutoTbody.appendChild(tr);
  }
}

function renderPublishRecords(rows) {
  if (!publishRecordsTbody) return;
  publishRecordsTbody.innerHTML = "";
  if (!rows || rows.length === 0) {
    publishRecordsTbody.innerHTML = `<tr><td colspan="6">暂无发布记录。</td></tr>`;
    return;
  }
  for (const row of rows) {
    const pageUrl = row.blogPageUrl || row.targetUrl || "";
    const screenshot = row.screenshotDataUrl
      ? `<a href="${row.screenshotDataUrl}" target="_blank">查看</a>`
      : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}</td>
      <td class="url"><a href="${pageUrl}" target="_blank">${pageUrl || "-"}</a></td>
      <td>${row.status || "-"}</td>
      <td>${row.commentSystem || row.platform || "-"}</td>
      <td>${row.linkStatus || "-"}${row.checkedAt ? `<br />${new Date(row.checkedAt).toLocaleString()}` : ""}</td>
      <td>${screenshot}</td>
    `;
    publishRecordsTbody.appendChild(tr);
  }
}

async function refreshPublishRecords() {
  const result = await sendMessage("GET_PUBLISH_RECORDS");
  if (result?.ok) renderPublishRecords(result.rows || []);
}

async function refreshLogs() {
  const result = await sendMessage("GET_LOGS");
  if (!result?.ok || !logsList) return;
  logsList.innerHTML = "";
  for (const row of result.rows || []) {
    const div = document.createElement("div");
    div.className = `log-row ${row.level === "error" ? "error" : ""}`;
    const time = document.createElement("time");
    time.textContent = row.ts ? new Date(row.ts).toLocaleString() : "";
    const text = document.createElement("span");
    text.textContent = row.message || "";
    div.append(time, text);
    logsList.appendChild(div);
  }
  if (!logsList.childElementCount) logsList.textContent = "暂无日志。";
}

async function refreshResources() {
  const onlyNonSpam = filterNonSpam.checked;
  const onlyNoRegister = filterNoRegister.checked;
  const tabOnlyNonSpam = resourceFilterNonSpam?.checked ?? onlyNonSpam;
  const tabOnlyNoRegister = resourceFilterNoRegister?.checked ?? onlyNoRegister;

  const result = await sendMessage("GET_RESOURCES", {
    options: {
      onlyNonSpam,
      onlyNoRegister,
      limit: 200
    }
  });
  if (!result?.ok) return;
  renderRowsToTbody(result.rows || [], resourceTbody);

  const resultForTab = await sendMessage("GET_RESOURCES", {
    options: {
      onlyNonSpam: tabOnlyNonSpam,
      onlyNoRegister: tabOnlyNoRegister,
      limit: 500
    }
  });
  if (!resultForTab?.ok) return;
  renderRowsToTbody(resultForTab.rows || [], resourcesTabTbody);

  const blogResult = await sendMessage("GET_RESOURCES", {
    options: {
      onlyNonSpam: true,
      onlyNoRegister: true,
      limit: 200
    }
  });
  if (blogResult?.ok) renderBlogAutoRows(blogResult.rows || []);

  const semrushResult = await sendMessage("GET_RESOURCES", {
    options: {
      semrushPublishableOnly: true,
      limit: 300
    }
  });
  if (semrushResult?.ok) renderSemrushAutoRows(semrushResult.rows || []);
  await refreshPublishRecords();
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
});

filterNonSpam.addEventListener("change", refreshResources);
filterNoRegister.addEventListener("change", refreshResources);
resourceFilterNonSpam?.addEventListener("change", refreshResources);
resourceFilterNoRegister?.addEventListener("change", refreshResources);
refreshPublishRecordsBtn?.addEventListener("click", refreshPublishRecords);
checkPublishLinksBtn?.addEventListener("click", async () => {
  const result = await sendMessage("CHECK_PUBLISH_LINKS");
  if (!result?.ok) {
    alert(result?.error || "检查失败");
    return;
  }
  await refreshPublishRecords();
  alert(`检查完成：${result.checked || 0} 条`);
});
refreshBlogCandidatesBtn?.addEventListener("click", refreshResources);
blogAutoTbody?.addEventListener("click", async (event) => {
  const btn = event.target?.closest?.("button[data-blog-url]");
  if (!btn) return;
  if (blogPageUrlInput) blogPageUrlInput.value = btn.dataset.blogUrl || "";
  await openSelectedBlogCommentPage();
});
refreshSemrushListBtn?.addEventListener("click", refreshResources);
refreshLogsBtn?.addEventListener("click", refreshLogs);
semrushAutoTbody?.addEventListener("click", async (event) => {
  const btn = event.target?.closest?.("button[data-semrush-url]");
  if (!btn) return;
  if (blogPageUrlInput) blogPageUrlInput.value = btn.dataset.semrushUrl || "";
  await openSelectedBlogCommentPage();
});

startBtn.addEventListener("click", async () => {
  const domain = normalizeDomain(domainInput.value);
  if (!domain) {
    alert("请输入正确的目标域名，例如 example.com");
    return;
  }
  const result = await sendMessage("COLLECTION_START", { targetDomain: domain });
  if (!result?.ok) {
    alert(result?.error || "启动失败");
    return;
  }
  await refreshCollectionState();
  await refreshCounts();
  await refreshResources();
});

stopBtn.addEventListener("click", async () => {
  const result = await sendMessage("COLLECTION_STOP");
  if (!result?.ok) {
    alert(result?.error || "暂停失败");
    return;
  }
  await refreshCollectionState();
});

resetBtn.addEventListener("click", async () => {
  if (!confirm("确认重置全部数据？")) return;
  const result = await sendMessage("RESET_DEMO_DATA");
  if (!result?.ok) {
    alert(result?.error || "重置失败");
    return;
  }
  await refreshCollectionState();
  await refreshCounts();
  await refreshResources();
});

exportJsonBtn.addEventListener("click", async () => {
  const result = await sendMessage("GET_BACKUP_PAYLOAD");
  if (!result?.ok || !result.backup) {
    alert(result?.error || "导出失败");
    return;
  }
  const json = JSON.stringify(result.backup, null, 2);
  const fileName = `outlink-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  downloadTextFile(fileName, json, "application/json");
});

exportXlsxBtn.addEventListener("click", async () => {
  const result = await sendMessage("GET_RESOURCES", {
    options: { onlyNonSpam: false, onlyNoRegister: false, limit: 5000 }
  });
  if (!result?.ok) {
    alert(result?.error || "导出失败");
    return;
  }
  if (!globalThis.XLSX) {
    alert("XLSX 组件未加载，请重新加载插件");
    return;
  }
  const rows = result.rows || [];
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Resources");
  XLSX.writeFile(workbook, `outlink-resources-${new Date().toISOString().replace(/[:.]/g, "-")}.xlsx`);
});

importBtn.addEventListener("click", () => {
  importFileInput.value = "";
  importFileInput.click();
});

importFileInput.addEventListener("change", async () => {
  const files = Array.from(importFileInput.files || []);
  if (!files.length) return;
  try {
    let imported = 0;
    for (const file of files) {
      const name = (file.name || "").toLowerCase();
      let result;
      if (name.endsWith(".json")) {
        const payload = JSON.parse(await file.text());
        result = await sendMessage("IMPORT_BACKUP_PAYLOAD", { payload });
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        if (!globalThis.XLSX) throw new Error("XLSX 组件未加载");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const first = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(first, { defval: "" });
        result = await sendMessage("IMPORT_RESOURCES_ROWS", { rows });
      } else {
        result = await sendMessage("IMPORT_RESOURCES_ROWS", { rows: parseRowsFromTabularText(await file.text()) });
      }
      if (!result?.ok) throw new Error(`${file.name}: ${result?.error || "导入失败"}`);
      imported += Number(result.imported || 0);
    }
    await refreshCollectionState();
    await refreshCounts();
    await refreshResources();
    alert(`导入成功，共处理 ${files.length} 个文件，新增/更新 ${imported} 条资源`);
  } catch (error) {
    alert(`导入失败：${error?.message || String(error)}`);
  }
});

openAhrefs.addEventListener("click", async (event) => {
  event.preventDefault();
  const domain = normalizeDomain(domainInput.value);
  if (!domain) return;
  await chrome.tabs.create({ url: ahrefsBacklinkUrl(domain), active: true });
});

openSemrushBacklinksBtn?.addEventListener("click", async () => {
  const domain = normalizeDomain(semrushCompetitorInput?.value || "");
  if (!domain) {
    alert("请输入正确的竞品 URL 或域名，例如 myclaw.ai");
    return;
  }
  const result = await sendMessage("SEMRUSH_COLLECTION_START", { competitorDomain: domain });
  if (!result?.ok) {
    alert(result?.error || "打开 Semrush 失败");
    return;
  }
  await refreshCollectionState();
  await refreshCounts();
  await refreshResources();
});

savePublishConfigBtn?.addEventListener("click", async () => {
  const config = {
    openrouterApiKey: openrouterKeyInput?.value?.trim() || "",
    openrouterModel: openrouterModelInput?.value?.trim() || "google/gemini-2.0-flash-001",
    autoSubmitProductHunt: Boolean(autoSubmitProducthunt?.checked),
    blogSiteName: blogSiteNameInput?.value?.trim() || "",
    blogKeyword: blogKeywordInput?.value?.trim() || "",
    blogAuthorName: blogAuthorNameInput?.value?.trim() || "",
    blogAuthorEmail: blogAuthorEmailInput?.value?.trim() || "",
    blogWebsiteUrl: blogTargetUrlInput?.value?.trim() || "",
    autoSubmitBlogComment: Boolean(autoSubmitBlogComment?.checked),
    blogFallbackComment: blogFallbackCommentInput?.value?.trim() || ""
  };
  const result = await sendMessage("SAVE_PUBLISH_CONFIG", { config });
  if (!result?.ok) {
    alert(result?.error || "保存配置失败");
    return;
  }
  alert("发布配置已保存");
});

saveBlogConfigBtn?.addEventListener("click", async () => {
  const config = {
    openrouterApiKey: openrouterKeyInput?.value?.trim() || "",
    openrouterModel: openrouterModelInput?.value?.trim() || "google/gemini-2.0-flash-001",
    blogSiteName: blogSiteNameInput?.value?.trim() || "",
    blogKeyword: blogKeywordInput?.value?.trim() || "",
    blogAuthorName: blogAuthorNameInput?.value?.trim() || "",
    blogAuthorEmail: blogAuthorEmailInput?.value?.trim() || "",
    blogWebsiteUrl: blogTargetUrlInput?.value?.trim() || "",
    autoSubmitBlogComment: Boolean(autoSubmitBlogComment?.checked),
    blogFallbackComment: blogFallbackCommentInput?.value?.trim() || ""
  };
  const result = await sendMessage("SAVE_PUBLISH_CONFIG", { config });
  if (!result?.ok) {
    alert(result?.error || "保存配置失败");
    return;
  }
  alert("博客外链配置已保存");
});

generateBlogCommentBtn?.addEventListener("click", async () => {
  const targetUrl = normalizeUrl(blogTargetUrlInput?.value || "");
  if (!targetUrl) {
    alert("请先输入要做外链的 URL");
    return;
  }
  const result = await sendMessage("GENERATE_BLOG_COMMENT_DRAFT", {
    payload: {
      targetUrl,
      siteName: blogSiteNameInput?.value || "",
      keyword: blogKeywordInput?.value || "",
      blogPageUrl: blogPageUrlInput?.value || "",
      extraContext: blogExtraContextInput?.value || ""
    }
  });
  if (!result?.ok) {
    alert(result?.error || "生成失败");
    return;
  }
  if (blogCommentInput) blogCommentInput.value = result.draft?.comment || "";
});

inspectCurrentCommentBtn?.addEventListener("click", async () => {
  const result = await sendMessage("INSPECT_CURRENT_COMMENT_PAGE");
  if (!result?.ok) {
    alert(result?.error || "检测当前页失败");
    return;
  }
  const info = result.inspection || {};
  if (currentCommentSystem) {
    const flags = [
      info.hasUrlField ? "有 Website 字段" : "无 Website 字段",
      info.hasCaptcha ? "有验证码" : "无验证码",
      info.loginRequired ? "需要登录" : "无需登录",
      `建议：${info.recommendedAction || "未知"}`
    ];
    currentCommentSystem.textContent = `当前页：${info.system || "unknown"}｜${flags.join("｜")}`;
  }
  if (blogPageUrlInput && info.pageUrl) blogPageUrlInput.value = info.pageUrl;
});

generateCurrentCommentBtn?.addEventListener("click", async () => {
  const targetUrl = normalizeUrl(blogTargetUrlInput?.value || "");
  if (!targetUrl) {
    alert("请先输入要做外链的 URL");
    return;
  }
  const result = await sendMessage("GENERATE_CURRENT_PAGE_BLOG_COMMENT", {
    payload: {
      targetUrl,
      siteName: blogSiteNameInput?.value || "",
      keyword: blogKeywordInput?.value || "",
      extraContext: blogExtraContextInput?.value || ""
    }
  });
  if (!result?.ok) {
    alert(result?.error || "按当前文章生成失败");
    return;
  }
  if (blogCommentInput) blogCommentInput.value = result.draft?.comment || "";
  const info = result.inspection || {};
  if (currentCommentSystem) {
    currentCommentSystem.textContent = `当前页评论系统：${info.system || "unknown"}（${info.article?.title || info.reason || "-"}）`;
  }
  if (blogPageUrlInput && info.pageUrl) blogPageUrlInput.value = info.pageUrl;
});

prefillCurrentCommentBtn?.addEventListener("click", async () => {
  const targetUrl = normalizeUrl(blogTargetUrlInput?.value || "");
  const comment = blogCommentInput?.value?.trim() || "";
  if (!targetUrl) {
    alert("请先输入要做外链的 URL");
    return;
  }
  if (!comment) {
    alert("请先生成或填写评论内容");
    return;
  }
  const result = await sendMessage("PREFILL_CURRENT_PAGE_BLOG_COMMENT", {
    payload: {
      targetUrl,
      authorName: blogAuthorNameInput?.value || "",
      authorEmail: blogAuthorEmailInput?.value || "",
      comment,
      fallbackComment: blogFallbackCommentInput?.value || ""
    }
  });
  if (!result?.ok) {
    alert(result?.error || "预填当前页失败");
    return;
  }
  alert("已预填当前页，请确认评论内容后再点“一键提交”。");
});

submitCurrentCommentBtn?.addEventListener("click", async () => {
  if (!confirm("确认提交当前页面的评论？")) return;
  const result = await sendMessage("SUBMIT_CURRENT_PAGE_BLOG_COMMENT", {
    payload: {
      targetUrl: normalizeUrl(blogTargetUrlInput?.value || ""),
      comment: blogCommentInput?.value || ""
    }
  });
  if (!result?.ok) {
    alert(result?.error || "提交失败");
    return;
  }
  await refreshCounts();
  alert("已尝试提交，并保存截图和发布记录。");
});

async function openSelectedBlogCommentPage() {
  const blogPageUrl = normalizeUrl(blogPageUrlInput?.value || "");
  const targetUrl = normalizeUrl(blogTargetUrlInput?.value || "");
  if (!blogPageUrl) {
    alert("请先选择或输入博客评论页 URL");
    return;
  }
  if (!targetUrl) {
    alert("请先输入要做外链的 URL");
    return;
  }
  if (autoSubmitBlogComment?.checked && !confirm("已开启自动提交。确认让插件在这一个页面填写后点击提交吗？遇到验证码仍会停止。")) return;
  const result = await sendMessage("OPEN_AND_FILL_BLOG_COMMENT", {
    payload: {
      blogPageUrl,
      targetUrl,
      authorName: blogAuthorNameInput?.value || "",
      authorEmail: blogAuthorEmailInput?.value || "",
      comment: blogCommentInput?.value || "",
      fallbackComment: blogFallbackCommentInput?.value || "",
      extraContext: blogExtraContextInput?.value || "",
      autoSubmit: Boolean(autoSubmitBlogComment?.checked)
    }
  });
  if (!result?.ok) {
    alert(result?.error || "打开博客评论页失败");
    return;
  }
  alert("已打开博客评论页，插件会自动填写评论表单。若未填充，请等待页面加载完成后再点一次。");
}

openBlogCommentBtn?.addEventListener("click", openSelectedBlogCommentPage);

generatePhDraftBtn?.addEventListener("click", async () => {
  const targetUrl = phTargetUrlInput?.value?.trim() || "";
  if (!targetUrl) {
    alert("请先输入要发布的 URL");
    return;
  }
  const result = await sendMessage("GENERATE_PRODUCTHUNT_DRAFT", {
    payload: {
      targetUrl,
      extraContext: phExtraContextInput?.value || ""
    }
  });
  if (!result?.ok) {
    alert(result?.error || "生成失败");
    return;
  }
  const draft = result.draft || {};
  if (phNameInput) phNameInput.value = draft.name || "";
  if (phTaglineInput) phTaglineInput.value = draft.tagline || "";
  if (phDescInput) phDescInput.value = draft.description || "";
  if (phCommentInput) phCommentInput.value = draft.firstComment || "";
  if (phTopicsInput) phTopicsInput.value = Array.isArray(draft.topics) ? draft.topics.join(", ") : "";
});

publishToPhBtn?.addEventListener("click", async () => {
  const targetUrl = phTargetUrlInput?.value?.trim() || "";
  if (!targetUrl) {
    alert("请先输入要发布的 URL");
    return;
  }
  const draft = {
    name: phNameInput?.value || "",
    tagline: phTaglineInput?.value || "",
    description: phDescInput?.value || "",
    firstComment: phCommentInput?.value || "",
    topics: parseTopics(phTopicsInput?.value || "")
  };
  const result = await sendMessage("OPEN_AND_FILL_PRODUCTHUNT", {
    payload: {
      targetUrl,
      draft,
      extraContext: phExtraContextInput?.value || "",
      autoSubmit: Boolean(autoSubmitProducthunt?.checked)
    }
  });
  if (!result?.ok) {
    alert(result?.error || "打开 Product Hunt 失败");
    return;
  }
  alert("已打开 Product Hunt 发布页，插件将自动填充表单。若 3-5 秒内未填充，请刷新该页面后再点一次。");
});

async function init() {
  activateTab("collect");
  await refreshCounts();
  await refreshCollectionState();
  await refreshResources();
  await refreshPublishConfig();
  await refreshLogs();
  setInterval(async () => {
    await refreshCounts();
    await refreshCollectionState();
    await refreshResources();
  }, 2500);
}

init();
