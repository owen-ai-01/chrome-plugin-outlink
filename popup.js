const tabs = Array.from(document.querySelectorAll(".tab"));
const panels = Array.from(document.querySelectorAll(".panel"));
const startBtn = document.getElementById("startCollectBtn");
const stopBtn = document.getElementById("stopCollectBtn");
const resetBtn = document.getElementById("resetBtn");
const domainInput = document.getElementById("targetDomainInput");

const badgeCollection = document.getElementById("badge-collection");
const badgePublish = document.getElementById("badge-publish");
const badgeLogs = document.getElementById("badge-logs");
const badgeResources = document.getElementById("badge-resources");

const statDiscovered = document.getElementById("statDiscovered");
const statAnalyzed = document.getElementById("statAnalyzed");
const statBlogComment = document.getElementById("statBlogComment");
const statQueued = document.getElementById("statQueued");
const collectionStatus = document.getElementById("collectionStatus");
const collectionTarget = document.getElementById("collectionTarget");
const recentList = document.getElementById("recentList");

const openSemrushLink = document.getElementById("openSemrush");
const openAhrefsLink = document.getElementById("openAhrefs");

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

function formatLocal(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  return date.toLocaleString();
}

function semrushBacklinkUrl(domain) {
  return `https://www.semrush.com/analytics/backlinks/overview/?searchType=domain&q=${encodeURIComponent(domain)}`;
}

function ahrefsBacklinkUrl(domain) {
  return `https://app.ahrefs.com/v2-site-explorer/overview?target=${encodeURIComponent(domain)}`;
}

async function sendMessage(action, payload = {}) {
  return chrome.runtime.sendMessage({ action, ...payload });
}

async function refreshTableCounts() {
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
  if (!domainInput.value && state.targetDomain) {
    domainInput.value = state.targetDomain;
  }

  statDiscovered.textContent = String(state.counts.discovered || 0);
  statAnalyzed.textContent = String(state.counts.analyzed || 0);
  statBlogComment.textContent = String(state.counts.blogCommentResources || 0);
  statQueued.textContent = String(state.counts.queued || 0);
  collectionStatus.textContent = `状态：${state.status || "-"}`;
  collectionTarget.textContent = `目标域名：${state.targetDomain || "-"}`;
  openSemrushLink.dataset.domain = state.targetDomain || "";
  openAhrefsLink.dataset.domain = state.targetDomain || "";

  const recent = Array.isArray(state.recent) ? state.recent : [];
  recentList.innerHTML = "";
  if (recent.length === 0) {
    recentList.innerHTML = `<div class="recent-item">还没有分析记录，先点击“开始收集”。</div>`;
    return;
  }

  for (const item of recent) {
    const element = document.createElement("article");
    element.className = "recent-item";
    element.innerHTML = `
      <div class="head">
        <span>${item.source || "unknown"}</span>
        <span>${formatLocal(item.ts)}</span>
      </div>
      <div>解析：${item.extracted || 0}，新增：${item.discovered || 0}，博客评论：${item.blogComment || 0}</div>
    `;
    recentList.appendChild(element);
  }
}

function activateTab(tabName) {
  for (const tab of tabs) {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("active", active);
  }
  for (const panel of panels) {
    panel.classList.toggle("active", panel.id === `panel-${tabName}`);
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
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
  await refreshTableCounts();
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
  const confirmed = confirm("确认重置全部演示数据？");
  if (!confirmed) return;
  const result = await sendMessage("RESET_DEMO_DATA");
  if (!result?.ok) {
    alert(result?.error || "重置失败");
    return;
  }
  await refreshCollectionState();
  await refreshTableCounts();
});

openSemrushLink.addEventListener("click", async (event) => {
  event.preventDefault();
  const domain = normalizeDomain(domainInput.value || openSemrushLink.dataset.domain || "");
  if (!domain) return;
  await chrome.tabs.create({ url: semrushBacklinkUrl(domain), active: true });
});

openAhrefsLink.addEventListener("click", async (event) => {
  event.preventDefault();
  const domain = normalizeDomain(domainInput.value || openAhrefsLink.dataset.domain || "");
  if (!domain) return;
  await chrome.tabs.create({ url: ahrefsBacklinkUrl(domain), active: true });
});

async function init() {
  activateTab("collect");
  await refreshCollectionState();
  await refreshTableCounts();
  setInterval(async () => {
    await refreshCollectionState();
    await refreshTableCounts();
  }, 2500);
}

init();
