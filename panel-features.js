const $ = (id) => document.getElementById(id);
let featureState = null;
let managedResources = [];
let managedPublishRecords = [];

async function msg(action, payload = {}) {
  return chrome.runtime.sendMessage({ action, ...payload });
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function renderTemplate(content, site) {
  const now = new Date();
  return String(content || "")
    .replaceAll("{siteName}", site?.name || "")
    .replaceAll("{siteUrl}", site?.url || "")
    .replaceAll("{keyword}", site?.keyword || "")
    .replaceAll("{date}", now.toLocaleDateString())
    .replaceAll("{year}", String(now.getFullYear()));
}

async function loadFeatures() {
  const result = await msg("FEATURE_GET_ALL");
  if (!result?.ok) throw new Error(result?.error || "读取扩展配置失败");
  featureState = result.features;
  renderSites();
  renderTemplates();
  renderSettings();
  renderQueue();
  await loadManagedResources();
  await renderStats();
}

function renderSites() {
  const list = $("siteList");
  const select = $("queueSiteSelect");
  if (!list || !select || !featureState) return;
  list.innerHTML = featureState.targetSites.length ? "" : '<div class="manage-row"><span></span><span>还没有推广网站。</span><span></span></div>';
  select.innerHTML = '<option value="">选择推广网站</option>';
  for (const site of featureState.targetSites) {
    const row = document.createElement("div");
    row.className = "manage-row";
    row.innerHTML = `<span>🎯</span><span><strong>${esc(site.name)}</strong><span class="sub">${esc(site.url)} · ${esc(site.keyword)}</span></span><span class="manage-actions"><button data-site-edit="${site.id}">编辑</button><button class="danger" data-site-delete="${site.id}">删除</button></span>`;
    list.appendChild(row);
    const option = document.createElement("option");
    option.value = site.id;
    option.textContent = `${site.name} — ${site.url}`;
    select.appendChild(option);
  }
}

function clearSiteForm() {
  for (const id of ["siteEditId", "siteName", "siteUrl", "siteKeyword", "siteAuthorName", "siteAuthorEmail"]) $(id).value = "";
  $("siteLanguage").value = "auto";
}

function renderTemplates() {
  const list = $("templateList");
  if (!list || !featureState) return;
  list.innerHTML = "";
  for (const template of featureState.templates) {
    const row = document.createElement("div");
    row.className = "manage-row";
    row.innerHTML = `<span>📝</span><span><strong>${esc(template.name)}</strong><span class="sub">${esc(template.content)}</span></span><span class="manage-actions"><button data-template-use="${template.id}">使用</button>${template.builtIn ? "" : `<button data-template-edit="${template.id}">编辑</button><button class="danger" data-template-delete="${template.id}">删除</button>`}</span>`;
    list.appendChild(row);
  }
}

function clearTemplateForm() {
  $("templateEditId").value = "";
  $("templateName").value = "";
  $("templateLanguage").value = "auto";
  $("templateContent").value = "";
}

function renderSettings() {
  const settings = featureState?.settings || {};
  for (const id of ["delaySeconds", "randomDelaySeconds", "dailyLimit", "perDomainLimit", "sheetEndpointUrl", "sheetName", "scheduleHours"]) if ($(id)) $(id).value = settings[id] ?? "";
  $("blacklist").value = (settings.blacklist || []).join("\n");
  $("whitelist").value = (settings.whitelist || []).join("\n");
  $("scheduledDomains").value = (settings.scheduledDomains || []).join("\n");
  $("scheduleEnabled").checked = Boolean(settings.scheduleEnabled);
}

async function loadManagedResources() {
  const [result, published] = await Promise.all([msg("GET_RESOURCES", { options: { limit: 1000 } }), msg("GET_PUBLISH_RECORDS")]);
  managedResources = result?.ok ? result.rows || [] : [];
  managedPublishRecords = published?.ok ? published.rows || [] : [];
  renderManagedResources();
}

function filteredResources() {
  const query = String($("queueSearch")?.value || "").toLowerCase();
  const minDr = Number($("queueMinDr")?.value || 0);
  const status = $("queueResourceStatus")?.value || "candidate";
  const linkType = $("queueLinkType")?.value || "all";
  const age = $("queueAge")?.value || "all";
  return managedResources.filter((row) => {
    if (query && !`${row.url} ${row.domain} ${row.anchor || ""}`.toLowerCase().includes(query)) return false;
    if (Number(row.dr || row.da || 0) < minDr) return false;
    if (status === "candidate" && !row.isNonSpam) return false;
    if (status === "blog" && !row.isBlogCommentCandidate) return false;
    if (linkType === "follow" && !/(^|\b)dofollow|^follow$/i.test(row.linkType || "")) return false;
    if (linkType === "nofollow" && !/nofollow|ugc/i.test(row.linkType || "")) return false;
    if (age !== "all" && Date.now() - Date.parse(row.firstSeen || row.createdAt || 0) > Number(age) * 86400000) return false;
    return true;
  }).slice(0, 500);
}

function renderManagedResources() {
  const list = $("resourceManageList");
  if (!list) return;
  const rows = filteredResources();
  list.innerHTML = rows.length ? "" : '<div class="manage-row"><span></span><span>没有符合条件的资源。</span><span></span></div>';
  for (const resource of rows) {
    const siteId = $("queueSiteSelect")?.value || "";
    const records = managedPublishRecords.filter((item) => item.resourceId === resource.id && (!siteId || item.targetSiteId === siteId));
    const publishedState = records.some((item) => ["visible_or_accepted", "pending_moderation", "submitted_try", "submitted_unknown"].includes(item.status)) ? "已尝试" : records.some((item) => /fail|reject/.test(item.status || "")) ? "失败" : "未发布";
    const row = document.createElement("div");
    row.className = "manage-row";
    row.innerHTML = `<input type="checkbox" data-resource-check="${resource.id}"><span><a href="${esc(resource.url)}" target="_blank">${esc(resource.domain || resource.url)}</a><span class="sub">DR ${esc(resource.dr ?? resource.da ?? "-")} · SPAM ${esc(resource.spamScore ?? "-")} · ${resource.isBlogCommentCandidate ? "博客候选" : "普通资源"} · ${publishedState}</span></span><span class="manage-actions"><button data-resource-open="${resource.id}">打开</button><button class="danger" data-resource-delete="${resource.id}">删除</button></span>`;
    list.appendChild(row);
  }
}

function selectedResourceIds() {
  return Array.from(document.querySelectorAll("[data-resource-check]:checked")).map((el) => el.dataset.resourceCheck);
}

function renderQueue() {
  const list = $("queueList");
  if (!list || !featureState) return;
  list.innerHTML = featureState.queue.length ? "" : '<div class="manage-row"><span></span><span>审核队列为空。</span><span></span></div>';
  for (const item of featureState.queue.slice().reverse()) {
    const site = featureState.targetSites.find((x) => x.id === item.siteId);
    const row = document.createElement("div");
    row.className = "manage-row";
    row.innerHTML = `<span>${item.status === "pending" ? "⏳" : item.status === "done" ? "✅" : "🔎"}</span><span><strong>${esc(item.domain)}</strong><span class="sub">${esc(site?.name || "未知项目")} · ${esc(item.status)} · ${esc(item.url)}</span></span><span class="manage-actions"><button data-queue-open="${item.id}">打开</button><button data-queue-done="${item.id}">标记完成</button></span>`;
    list.appendChild(row);
  }
}

async function renderStats() {
  const result = await msg("FEATURE_GET_STATS");
  const box = $("analyticsCards");
  if (!box || !result?.ok) return;
  const s = result.stats;
  const cards = [["资源总数", s.resources], ["非 SPAM", s.nonSpam], ["博客候选", s.blogCandidates], ["待审核任务", s.queuePending], ["发布记录", s.published], ["提交尝试", s.byStatus?.submitted_try || 0]];
  box.innerHTML = cards.map(([label, value]) => `<article class="card"><label>${esc(label)}</label><strong>${esc(value)}</strong></article>`).join("");
  const breakdown = $("analyticsBreakdown");
  if (breakdown) breakdown.innerHTML = `<div class="manage-row"><span>🔗</span><span>Follow / Nofollow</span><strong>${esc(s.follow)} / ${esc(s.nofollow)}</strong></div><div class="manage-row"><span>📊</span><span>DR 分布（低 / 中 / 高）</span><strong>${esc(s.dr.low)} / ${esc(s.dr.medium)} / ${esc(s.dr.high)}</strong></div>`;
}

async function openQueueItem(id) {
  const item = featureState.queue.find((x) => x.id === id);
  const site = featureState.targetSites.find((x) => x.id === item?.siteId);
  if (!item || !site) return alert("任务或推广网站不存在");
  const mostRecent = featureState.queue.map((x) => Date.parse(x.openedAt || 0)).filter(Number.isFinite).sort((a, b) => b - a)[0] || 0;
  const requiredDelay = Number(featureState.settings.delaySeconds || 0) + Math.floor(Math.random() * (Number(featureState.settings.randomDelaySeconds || 0) + 1));
  const remaining = Math.ceil((mostRecent + requiredDelay * 1000 - Date.now()) / 1000);
  if (remaining > 0) return alert(`发布策略要求继续等待约 ${remaining} 秒`);
  const comment = $("blogCommentInput")?.value?.trim() || "";
  const result = await msg("OPEN_AND_FILL_BLOG_COMMENT", { payload: { blogPageUrl: item.url, targetUrl: site.url, authorName: site.authorName, authorEmail: site.authorEmail, comment, extraContext: site.keyword, autoSubmit: false, resourceId: item.resourceId, targetSiteId: site.id, queueId: item.id } });
  if (!result?.ok) return alert(result?.error || "打开任务失败");
  await msg("FEATURE_QUEUE_UPDATE", { id: item.id, patch: { status: "reviewing", openedAt: new Date().toISOString() } });
  await loadFeatures();
}

$("saveSiteBtn")?.addEventListener("click", async () => {
  const result = await msg("FEATURE_SAVE_SITE", { site: { id: $("siteEditId").value, name: $("siteName").value, url: $("siteUrl").value, keyword: $("siteKeyword").value, authorName: $("siteAuthorName").value, authorEmail: $("siteAuthorEmail").value, language: $("siteLanguage").value } });
  if (!result?.ok) return alert(result?.error || "保存失败");
  clearSiteForm(); await loadFeatures();
});
$("clearSiteBtn")?.addEventListener("click", clearSiteForm);
$("siteList")?.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-site-edit]");
  const del = event.target.closest("[data-site-delete]");
  if (edit) {
    const site = featureState.targetSites.find((x) => x.id === edit.dataset.siteEdit);
    if (!site) return;
    $("siteEditId").value = site.id; $("siteName").value = site.name; $("siteUrl").value = site.url; $("siteKeyword").value = site.keyword; $("siteAuthorName").value = site.authorName; $("siteAuthorEmail").value = site.authorEmail; $("siteLanguage").value = site.language;
  }
  if (del && confirm("删除这个推广网站及其队列任务？")) { await msg("FEATURE_DELETE_SITE", { id: del.dataset.siteDelete }); await loadFeatures(); }
});

$("saveStrategyBtn")?.addEventListener("click", async () => {
  const settings = {}; for (const id of ["delaySeconds", "randomDelaySeconds", "dailyLimit", "perDomainLimit", "blacklist", "whitelist", "sheetEndpointUrl", "sheetName", "scheduleHours", "scheduledDomains"]) settings[id] = $(id).value;
  settings.scheduleEnabled = $("scheduleEnabled").checked;
  const result = await msg("FEATURE_SAVE_SETTINGS", { settings }); if (!result?.ok) return alert(result?.error || "保存失败"); await loadFeatures();
});

$("saveTemplateBtn")?.addEventListener("click", async () => {
  const result = await msg("FEATURE_SAVE_TEMPLATE", { template: { id: $("templateEditId").value, name: $("templateName").value, language: $("templateLanguage").value, content: $("templateContent").value } });
  if (!result?.ok) return alert(result?.error || "保存失败"); clearTemplateForm(); await loadFeatures();
});
$("clearTemplateBtn")?.addEventListener("click", clearTemplateForm);
$("templateList")?.addEventListener("click", async (event) => {
  const use = event.target.closest("[data-template-use]"); const edit = event.target.closest("[data-template-edit]"); const del = event.target.closest("[data-template-delete]");
  const id = use?.dataset.templateUse || edit?.dataset.templateEdit || del?.dataset.templateDelete;
  const template = featureState.templates.find((x) => x.id === id); if (!template) return;
  if (use) { const site = featureState.targetSites.find((x) => x.id === $("queueSiteSelect").value) || featureState.targetSites[0]; $("blogCommentInput").value = renderTemplate(template.content, site); document.querySelector('[data-tab="blog-auto"]')?.click(); }
  if (edit) { $("templateEditId").value = template.id; $("templateName").value = template.name; $("templateLanguage").value = template.language; $("templateContent").value = template.content; }
  if (del && confirm("删除这个模板？")) { await msg("FEATURE_DELETE_TEMPLATE", { id }); await loadFeatures(); }
});

$("exportTemplatesBtn")?.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(featureState.templates, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "outlink-templates.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("importTemplatesBtn")?.addEventListener("click", () => $("templateFileInput").click());
$("templateFileInput")?.addEventListener("change", async () => { const rows = JSON.parse(await $("templateFileInput").files[0].text()); for (const row of rows) await msg("FEATURE_SAVE_TEMPLATE", { template: { name: row.name, language: row.language, content: row.content } }); await loadFeatures(); });

for (const id of ["queueSearch", "queueMinDr", "queueResourceStatus", "queueLinkType", "queueAge"]) $(id)?.addEventListener(id === "queueSearch" ? "input" : "change", renderManagedResources);
$("selectVisibleBtn")?.addEventListener("click", () => document.querySelectorAll("[data-resource-check]").forEach((el) => { el.checked = true; }));
$("createQueueBtn")?.addEventListener("click", async () => { const result = await msg("FEATURE_QUEUE_CREATE", { siteId: $("queueSiteSelect").value, resourceIds: selectedResourceIds() }); if (!result?.ok) return alert(result?.error || "创建队列失败"); alert(`已加入 ${result.added} 条`); await loadFeatures(); });
$("deleteSelectedResourcesBtn")?.addEventListener("click", async () => { const ids = selectedResourceIds(); if (!ids.length || !confirm(`删除选中的 ${ids.length} 条资源？`)) return; await msg("FEATURE_RESOURCE_MUTATE", { operation: "delete", ids }); await loadFeatures(); });
$("resourceManageList")?.addEventListener("click", async (event) => { const open = event.target.closest("[data-resource-open]"); const del = event.target.closest("[data-resource-delete]"); const id = open?.dataset.resourceOpen || del?.dataset.resourceDelete; const row = managedResources.find((x) => x.id === id); if (open && row) chrome.tabs.create({ url: row.url }); if (del && confirm("删除这条资源？")) { await msg("FEATURE_RESOURCE_MUTATE", { operation: "delete", ids: [id] }); await loadFeatures(); } });
$("queueList")?.addEventListener("click", async (event) => { const open = event.target.closest("[data-queue-open]"); const done = event.target.closest("[data-queue-done]"); if (open) await openQueueItem(open.dataset.queueOpen); if (done) { await msg("FEATURE_QUEUE_UPDATE", { id: done.dataset.queueDone, patch: { status: "done" } }); await loadFeatures(); } });
$("openNextQueueBtn")?.addEventListener("click", async () => { const next = featureState.queue.find((x) => x.status === "pending"); if (!next) return alert("没有待审核任务"); await openQueueItem(next.id); });
$("refreshQueueBtn")?.addEventListener("click", loadFeatures);
$("queueSiteSelect")?.addEventListener("change", renderManagedResources);
function exportResourceSubset(mode) {
  const siteId = $("queueSiteSelect").value;
  const publishedIds = new Set(managedPublishRecords.filter((row) => !siteId || row.targetSiteId === siteId).filter((row) => !/fail|reject/.test(row.status || "")).map((row) => row.resourceId));
  const rows = managedResources.filter((row) => mode === "published" ? publishedIds.has(row.id) : !publishedIds.has(row.id));
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = "\uFEFF" + ["URL,Domain,DR,Status", ...rows.map((row) => [row.url, row.domain, row.dr ?? row.da ?? "", mode].map(quote).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${mode}-resources.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("exportPublishedBtn")?.addEventListener("click", () => exportResourceSubset("published"));
$("exportPendingBtn")?.addEventListener("click", () => exportResourceSubset("pending"));
$("saveSheetSettingsBtn")?.addEventListener("click", () => $("saveStrategyBtn").click());
$("syncSheetsBtn")?.addEventListener("click", async () => { if (!confirm("确认把资源、发布记录和推广项目发送到你配置的 Google Apps Script 地址？")) return; const result = await msg("FEATURE_SHEETS_SYNC"); alert(result?.ok ? "同步完成" : result?.error || "同步失败"); });

loadFeatures().catch((error) => console.error(error));
