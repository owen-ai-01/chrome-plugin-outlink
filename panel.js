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

function buildXlsxTextRows(rows) {
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
  const lines = [headers.join("\t")];
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
      .join("\t");
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
  const headerMatches = firstRowHeaders.filter((h) => Object.prototype.hasOwnProperty.call(knownHeaders, h)).length;
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
    ? allRows[0].map((h) => knownHeaders[normalizeHeaderKey(h)] || null)
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
}

function cellStatus(value) {
  return value ? '<span class="status-yes">是</span>' : '<span class="status-no">否</span>';
}

function renderRowsToTbody(rows, tbody) {
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="13">暂无数据，先点击“开始收集”。</td></tr>`;
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
      <td>${row.traffic ?? "-"}</td>
      <td>${row.spamScore ?? "-"}</td>
      <td>${cellStatus(row.isBlogCommentCandidate)}</td>
      <td title="${row.noRegisterReason || ""}">${cellStatus(row.noRegisterLikely && row.isNonSpam)}</td>
    `;
    tbody.appendChild(tr);
  }
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
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
});

filterNonSpam.addEventListener("change", refreshResources);
filterNoRegister.addEventListener("change", refreshResources);
resourceFilterNonSpam?.addEventListener("change", refreshResources);
resourceFilterNoRegister?.addEventListener("change", refreshResources);

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
  const text = buildXlsxTextRows(result.rows || []);
  const fileName = `outlink-resources-${new Date().toISOString().replace(/[:.]/g, "-")}.xlsx`;
  downloadTextFile(fileName, text, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
});

importBtn.addEventListener("click", () => {
  importFileInput.value = "";
  importFileInput.click();
});

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files?.[0];
  if (!file) return;
  try {
    const name = (file.name || "").toLowerCase();
    const text = await file.text();
    let result;
    if (name.endsWith(".json")) {
      const payload = JSON.parse(text);
      result = await sendMessage("IMPORT_BACKUP_PAYLOAD", { payload });
    } else {
      const rows = parseRowsFromTabularText(text);
      result = await sendMessage("IMPORT_RESOURCES_ROWS", { rows });
    }
    if (!result?.ok) throw new Error(result?.error || "导入失败");
    await refreshCollectionState();
    await refreshCounts();
    await refreshResources();
    alert(`导入成功${typeof result.imported === "number" ? `，新增/更新 ${result.imported} 条` : ""}`);
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

savePublishConfigBtn?.addEventListener("click", async () => {
  const config = {
    openrouterApiKey: openrouterKeyInput?.value?.trim() || "",
    openrouterModel: openrouterModelInput?.value?.trim() || "google/gemini-2.0-flash-001",
    autoSubmitProductHunt: Boolean(autoSubmitProducthunt?.checked)
  };
  const result = await sendMessage("SAVE_PUBLISH_CONFIG", { config });
  if (!result?.ok) {
    alert(result?.error || "保存配置失败");
    return;
  }
  alert("发布配置已保存");
});

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
  setInterval(async () => {
    await refreshCounts();
    await refreshCollectionState();
    await refreshResources();
  }, 2500);
}

init();
