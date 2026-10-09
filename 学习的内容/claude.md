# 博客外链助手 - 修改记录

> 新增修改记录请追加到文件末尾，按时间顺序排列。

---

## 2026-03-13

### 1. 支持自定义 SEMrush 域名（sem.3ue.com）

**问题**：插件只支持官方 `semrush.com`，无法识别自定义部署域名。

**修改文件**：
- `popup/popup.js` — `detectPageType()` 增加 `sem.3ue.com` 和 `sem\.\w+\.com` 匹配
- `content/content.js` — `handleCollectLinks()` 增加自定义域名判断
- `manifest.json` — `host_permissions` 和 `content_scripts.matches` 添加 `https://sem.3ue.com/*`

---

### 2. 修复「无法连接到页面，请刷新后重试」

**原因**：插件安装/更新后，已打开的标签页不会自动注入 content script，导致 `chrome.tabs.sendMessage` 失败。

**修改文件**：
- `popup/popup.js` — 新增 `ensureContentScriptInjected()` 函数，每次操作前先 ping 检测，未注入则用 `chrome.scripting.executeScript` 主动注入

---

### 3. 修复 content script 重复注入报错

**原因**：主动注入时如果脚本已存在，`const` 块级作用域变量重复声明报错，且 `if` 块内的 `const` 外部无法访问。

**修改文件**：
- `content/detector.js` — 改为 `window.CommentDetector = {...}` + `if (typeof window.CommentDetector === 'undefined')` 保护
- `content/parser.js` — 改为 `window.SEMrushParser = {...}`
- `content/publisher.js` — 改为 `window.CommentPublisher = {...}`
- `content/content.js` — `if (typeof window.__backlinkInjected === 'undefined')` 保护；所有对象引用改为 `window.xxx`

---

### 4. 修复「SEMrushParser is not defined」

**原因**：`if` 块内的 `const` 是块级作用域，外部文件无法访问。

**修改文件**：
- `content/parser.js`、`content/detector.js`、`content/publisher.js` — 全部改为挂载到 `window` 对象
- `content/content.js` — 所有引用改为 `window.SEMrushParser`、`window.CommentDetector`、`window.CommentPublisher`

---

### 5. 修复「未找到外链数据」— 重写 parser.js

**原因**：`sem.3ue.com` 使用 React 虚拟列表渲染，页面无 `<table>` 元素，原解析器只支持表格。

**修改文件**：
- `content/content.js` — 新增 `debugPage` 消息处理和 `debugPageStructure()` 函数
- `popup/popup.html` — 采集区域新增「🔧 调试」按钮
- `popup/popup.js` — 新增 `debugPage()` 函数，下载调试 JSON
- `content/parser.js` — 完全重写，新增 `parseFromAnchors()` 方法，从 `<a>` 标签直接提取外链

---

### 6. 外链列表新增删除按钮和可点击链接

**修改文件**：
- `popup/popup.js` — `renderLinks()` 改为 `<a target="_blank">` 可点击链接，新增 `✕` 删除按钮
- `utils/storage.js` — 新增 `deleteLink(url)` 方法
- `popup/popup.css` — 新增 `.link-main`、`.btn-delete-link` 样式

---

### 7. 英文模板 + 评论表单自动填写

**修改文件**：
- `utils/storage.js` — 默认模板改为英文；`getDefaultSettings()` 新增 `authorName`、`authorEmail`、`authorWebsite`
- `utils/template.js` — 新增英文变量键（`siteName`、`keyword`、`siteUrl`、`date`、`year`）
- `options/options.html` — 新增「Comment Author Info」卡片
- `options/options.js` — `loadSettings/saveSettings` 新增三个字段
- `content/publisher.js` — 新增 `fillAuthorFields()` 自动填写 Name/Email/Website
- `content/content.js` — 发布时从 storage 读取作者信息传给 publisher

---

### 8. 外链库按目标网站分组管理（第一版）

**修改文件**：
- `options/options.html` — 侧边栏新增「🔗 外链库」导航
- `options/options.js` — 新增 `loadLinkLib()`、`renderLinkLib()` 等函数，按域名分组显示
- `options/options.css` — 新增外链库相关样式

---

### 9. 重构外链库：按「要发布的目标网站」分组管理

**数据结构变化**：新增 `target_sites` 存储键，每个目标网站记录 `publishedLinks: { linkUrl: { publishedAt, success } }`

**修改文件**：
- `utils/storage.js` — 新增 `TARGET_SITES` key 及相关方法
- `options/options.html` — 外链库 section 改为「目标网站管理」视图
- `options/options.js` — 重写外链库逻辑
- `options/options.css` — 新增目标网站相关样式

---

### 10. 重构自动发布流程

**流程**：选择目标网站 → 配置 → 设置数量 → 自动打开外链逐一发布 → 验证结果 → 记录状态

**修改文件**：
- `popup/popup.html` — 发布 Tab 完全重写
- `popup/popup.js` — 发布 Tab 逻辑完全重写，新增 `startAutoPublish()`、`publishToUrl()`、`waitForTabLoad()` 等
- `content/content.js` — 新增 `verifyPublish` 消息处理和 `verifyPublish()` 函数
- `popup/popup.css` — 新增发布 Tab 样式

---

### 11. 补充：关闭发布页面 + 50条英文评论模板

**修改文件**：
- `utils/storage.js` — `getDefaultTemplates()` 从5条扩展为50条英文模板

---

### 12. 基础配置与外链库按目标网站独立管理

**修改文件**：
- `utils/storage.js` — `addTargetSite()` 新增配置字段；新增 `updateTargetSiteConfig()` 方法
- `options/options.js` — 每个网站展开后显示配置表单；新增 `saveSiteConfig()`
- `options/options.css` — 新增网站配置表单样式
- `popup/popup.js` — 发布时使用对应网站的独立配置
- `utils/template.js` — 新增 `getRandomRenderedWithVars(vars)` 和 `renderByIdWithVars(id, vars)`

---

### 13. 修复 CSP 违规：移除所有内联 onclick

**问题**：Chrome MV3 禁止内联事件处理器，导致设置页面按钮全部失效。

**修改文件**：
- `popup/popup.html` — 移除 `onerror` 内联事件
- `options/options.js` — 所有 `onclick="..."` 改为 `data-action` + `addEventListener` 事件委托
- `options/options.js` — `.onclick =` 赋值改为 `addEventListener`

---

### 14. 发布 Tab 选择网站后显示对应配置

**修改文件**：
- `popup/popup.js` — `onPubSiteChange()` 读取对应网站的 `authorName/authorEmail/authorWebsite` 更新 UI

---

### 15. 添加网站弹窗加入完整配置表单

**修改文件**：
- `options/options.js` — `openAddSiteModal()` 弹窗内加入 Site Name/Keyword/Author Name/Email/Website 字段；填写 URL 时自动同步到 Author Website

---

### 16. 新增「外链库」管理页面

**修改文件**：
- `options/options.html` — 新增 `section-backlinks`；原「外链库」改为「🎯 目标网站」
- `options/options.js` — 新增 `loadBacklinks()`、`renderBacklinks()`：每条外链显示各目标网站发布状态；支持搜索/过滤/批量删除/单条删除，删除时同步清除所有目标网站记录
- `options/options.css` — 新增 `.bl-list`、`.bl-row`、`.bl-status-col` 等样式

---

### 17. 大文件拆分重构（解决 AI 修改时 token 溢出卡住问题）

**原因**：`popup.js`(695行) 和 `options.js`(713行) 单文件过大，AI 读取+修改时 token 消耗过高，频繁导致生成中断。同时 `options.js` 末尾的分页函数在之前的修改中被截断不完整。

**拆分方案**：

**popup.js (695行) → 4个文件：**
- `popup/popup.js` (42行) — 入口文件，初始化 + Tab 切换
- `popup/popup-collect.js` (204行) — 采集 Tab：页面检测、SEMrush 采集、文件导入、content script 注入
- `popup/popup-links.js` (152行) — 外链列表 Tab：搜索过滤、分页渲染、导出、删除
- `popup/popup-publish.js` (244行) — 发布 Tab：目标网站选择、自动发布流程、日志记录

**options.js (713行) → 4个文件：**
- `options/options.js` (154行) — 入口文件，导航切换、设置加载/保存、公共函数（showSuccess、escapeHtml、renderPagination、bindPaginationEvents）
- `options/options-backlinks.js` (157行) — 外链库管理：搜索过滤、批量删除、分页显示
- `options/options-sites.js` (235行) — 目标网站管理：网站列表、配置表单、添加/删除网站
- `options/options-templates.js` (137行) — 模板管理：模板 CRUD、弹窗、预览

**修改文件**：
- `popup/popup.html` — script 引用从1个改为4个（popup-collect.js → popup-links.js → popup-publish.js → popup.js）
- `options/options.html` — script 引用从1个改为4个（options-backlinks.js → options-sites.js → options-templates.js → options.js）
- `options/options.js` — 补全了之前被截断的 `renderPagination()` 和 `bindPaginationEvents()` 分页函数

**注意**：拆分后所有函数仍为全局作用域，文件间可直接调用。入口文件（popup.js / options.js）必须最后加载。

---

### 18. 修复自动发布 "Could not establish connection" 错误

**问题**：自动发布时，某些页面（如评论数量很多的 WordPress 页面）加载较慢，`chrome.tabs.sendMessage` 在 content script 尚未就绪时发送消息，导致 "Could not establish connection. Receiving end does not exist." 错误。

**根本原因**：
1. `waitForTabLoad` 判断 `tab.status === 'complete'` 后立即注入，但页面 DOM/JS 可能还未完全就绪
2. `ensureContentScriptInjected` 注入后只等 500ms，对重页面不够
3. 自动注入（manifest）和手动注入（scripting API）存在竞争条件
4. 发送消息没有重试机制，一次失败就报错

**修改文件**：
- `popup/popup-collect.js` — `ensureContentScriptInjected()` 增加注入后 ping 重试（最多10次，每次500ms），失败后二次注入
- `popup/popup-publish.js` — `publishToUrl()` 页面加载后额外等待2秒；新增 `sendMessageWithRetry()` 函数，消息发送失败时自动重试3次（递增等待），每次重试前重新确保 content script 已注入

---

### 19. 支持"需要点击回复按钮才显示评论框"的页面

**问题**：某些 WordPress 页面（如 `kylat.ekarjala.fi`）评论框默认隐藏，每条评论下有 "Reply" / "Vastaa" 等回复按钮，需要先点击才能显示评论表单。原代码只检测可见的评论框，找不到就报"未找到评论区"。

**修改文件**：
- `content/detector.js` — 新增 `detectReplyButton()` 方法：当 `detectInDocument` 找不到可见评论框时，查找 `.comment-reply-link`、`a[data-commentid]`、`a[href*="replytocom"]` 等回复按钮；支持多语言关键词（reply/回复/vastaa/antworten/répondre/responder）；返回 `needClickReply: true` + `replyBtn` 元素
- `content/publisher.js` — 新增 `clickReplyAndDetect()` 方法：滚动到回复按钮 → 点击 → 等待 WordPress comment-reply.js 移动 #respond 表单 → 重新检测评论框（最多重试5次）；`publish()` 方法开头增加 `needClickReply` 判断，自动执行点击回复流程

---

### 20. 分析30条外链全部失败的原因并修复

**错误分析**（基于25个诊断 JSON 文件）：

| 错误类型 | 条数 | 原因 |
|---------|------|------|
| 未检测到发布成功标志 | 9条 | verifyPublish 判断太严格 + sliceofscifi 字段名混淆 |
| 未找到评论区 | 5条 | 外链库混入 wp-comments-post.php 接口 URL |
| captcha | 4条 | 目标站点启用验证码，无法自动化 |
| 点击回复按钮后未找到评论框 | 2条 | detectReplyButton 误识别导航链接 |
| spam/blocked/duplicate/error/failed | 5条 | 服务端反垃圾拦截 |

**修复1：字段名混淆（sliceofscifi 等站点）** — `content/publisher.js`
- 新增 `resolveCommentField()` 方法
- 处理反垃圾插件的字段名混淆攻击：`id=comment name=随机串`（真实框）vs `id=随机串 name=comment`（蜜罐）
- 在填写评论内容前自动识别并选择真实评论框

**修复2：过滤无效 URL** — `popup/popup-publish.js`
- 在 `publishToUrl()` 入口处增加 URL 预检
- 过滤 `wp-comments-post.php`、`/wp-json/`、`/feed/`、`/xmlrpc.php`、`/wp-login.php`、`/wp-admin/` 等非文章页面地址

**修复3：verifyPublish() 成功判断优化** — `content/content.js`
- 成功关键词从10个扩充到30+个，覆盖 "awaiting moderation"、"pending approval"、"comment posted" 等变体
- 新增 WordPress URL 跳转检测：`?unapproved=xxx`（审核中）、`#comment-xxx`（成功）
- 错误关键词收窄：移除通用词 `error`/`failed`，改为 `duplicate comment`、`comment flood` 等精确词

**修复4：detectReplyButton() 误识别** — `content/detector.js`
- 移除宽泛的兜底逻辑（之前把任何含 "reply"/"评论" 的链接都识别为回复按钮）
- 次优先逻辑改为：必须在 `#comments`/`.comment-list` 等评论容器内，且链接文字 ≤15字符且精确匹配

---

### 21. 去重机制改为域名去重

**修改文件**：`utils/storage.js`

- `saveLinks()` 方法改为按域名去重
- 同一域名的不同 URL 只保留第一条，避免重复发布到同一站点

---

### 22. 自动发布机制优化：只发布无状态链接

**修改文件**：`popup/popup-publish.js`

- 修改筛选逻辑：`links.filter(l => !publishedMap[l.url])`
- 只发布 `publishedLinks` 中没有任何记录的链接
- 无论之前成功还是失败，只要有记录就跳过，每个链接只尝试发布一次

---

### 23. 优化错误诊断：重复错误去重 + 增强表单代码采集

**修改文件**：
- `popup/popup-publish.js` — 新增 `downloadedErrors` Set，用「错误原因 + 域名」生成错误指纹，同一域名相同错误只下载一次诊断文件
- `content/publisher.js` — `collectDiagnostics()` 增强：
  - 新增 `commentFormHTML` 字段：单独提取评论表单的完整 `outerHTML`
  - 所有表单增加 `outerHTML` 字段
  - 字段信息新增 `value`（当前值）、`required`、`disabled`

---

## 2026-03-16

### 24. 改为逐字符输入（模拟真人打字），增加各步骤等待时间

**问题**：发布时字段填充太快，看不到输入过程，且部分站点反垃圾机制会检测输入速度。

**修改文件**：
- `content/publisher.js` — `fillAuthorFields()` 每个字段改为 `typeContent()` 逐字符输入（30-100ms/字）；每个字段填写前先滚动到该字段，填写后等待 400ms；滚动到评论区后等待 1000ms；填写完所有字段后等待 500ms；聚焦评论框等待 500ms；输入评论内容后等待 800ms；滚动到提交按钮等待 800ms
- `popup/popup-publish.js` — 提交后等待时间从 3s 增加到 5s，确保页面跳转/刷新完成

---

### 25. 修复 name/email/website 字段未填充的问题

**问题**：从失败日志看，comment 内容被成功填充，但 author/email/url 三个字段的 value 都是 null。

**根本原因**：`typeContent` 函数只修改了 `el.value`，没有触发足够的事件让 WordPress 表单验证识别到字段已填写。

**修改文件**：
- `content/publisher.js` — `typeContent()` 改为：
  - 每个字符输入后触发 `input`/`keydown`/`keypress`/`keyup` 事件
  - 输入完成后触发 `change`/`blur` 事件
  - 所有事件设置 `bubbles: true`

---

### 26. 智能字段查找 - 通过 label/span 文本、id/name/class/placeholder 多种方式定位

**问题**：原来只用 id 选择器查找字段，但不同站点的表单结构差异很大，id 只是一种可能性。

**修改文件**：
- `content/publisher.js` — 新增 `findFieldByType(form, fieldType)` 方法，支持多种查找策略：

  **查找优先级：**
  1. **label 文本**：找包含关键词的 label → 通过 `label.htmlFor` / label 内部 input / label 后续 input
  2. **span 文本**：找包含关键词的 span → span 内部 input / span 后续 input / span 父元素后续 input / span 父元素内部 input
  3. **id 属性**模糊匹配（如 `id*="author"`）
  4. **name 属性**模糊匹配
  5. **class 名称**模糊匹配
  6. **placeholder**模糊匹配
  7. **type 属性**（email → `type="email"`，website → `type="url"`）

  **支持的关键词：**
  - Name: name, author, username, user, nombre, nom
  - Email: email, e-mail, mail, correo
  - Website: website, url, site, web, blog, homepage, sitio

- `fillAuthorFields()` 改为调用 `findFieldByType()` 替代原来的 `findVisibleField()`

---

### 27. 修复 content.js 忽略 popup 传来的 authorInfo

**根本原因**：`content.js` 的 `handlePublishComment` 函数完全忽略了 `message.authorInfo`，直接从 `chrome.storage.local` 的 `settings`（基础配置）读取，而基础配置通常是空的，导致无论 popup 传什么数据都没用。

**修改文件**：
- `content/content.js` — `handlePublishComment()` 改为优先使用 `message.authorInfo`，只有当 authorInfo 为空时才回退到 storage 读取

---

### 28. 点击发布前弹窗确认 Author Name/Email/Website

**问题**：storage 数据读取时序问题导致字段为空，且用户无法在发布前确认数据是否正确。

**修改文件**：
- `popup/popup.html` — 新增发布确认弹窗 HTML
- `popup/popup.css` — 新增弹窗样式
- `popup/popup-publish.js` — 新增 `showPublishConfirm()`、`hidePublishConfirm()`、`onConfirmPublish()` 函数；`startAutoPublish()` 接受 `confirmedAuthorInfo` 参数，优先使用弹窗中用户确认的数据

**使用流程**：
1. 点击「🚀 开始自动发布」→ 弹出确认窗口
2. 弹窗自动从 storage 读取最新配置填入 Name/Email/Website/数量/间隔
3. 用户可直接修改任何字段
4. 点击「✅ 确认发布」后使用弹窗中的数据（绕开 storage 读取时序问题）

---

### 29. 外链库新增导出已发布成功的链接功能

**修改文件**：
- `options/options.html` — 外链库工具栏新增「📥 导出已发布」按钮
- `options/options-backlinks.js` — 新增 `exportPublishedLinks(links, sites)` 函数

**导出格式**：CSV 文件，包含三列：URL、Anchor Text、发布成功的目标网站（多个用分号分隔）；文件名 `published-links-{timestamp}.csv`；UTF-8 BOM 编码，Excel 打开中文正常显示

---

### 30. 禁用发布失败时自动下载诊断 JSON 文件

**修改文件**：
- `popup/popup-publish.js` — `saveDiagnosticJson()` 改为空实现，不再自动下载 `backlink-fail-xxx.json`

---

### 31. 发布确认弹窗新增备用评论内容文本框

**功能说明**：当目标网站的评论表单没有 Website 字段时，自动使用备用内容替代模板评论。

**修改文件**：
- `popup/popup.html` — 确认弹窗新增「备用评论内容」textarea
- `popup/popup.css` — 新增 `.pub-confirm-textarea`、`.pub-confirm-hint-small` 样式
- `popup/popup-publish.js` — `onConfirmPublish()` 传递 `fallbackComment` 参数
- `content/content.js` — 从 `message.authorInfo.fallbackComment` 提取备用内容传给 publisher
- `content/publisher.js` — `publish()` 接受 `fallbackComment` 参数；`fillAuthorFields()` 返回 `websiteFound` 布尔值；未找到 Website 字段且有备用内容时自动切换

**逻辑**：
- 有 Website 字段 → 正常填充，使用模板评论
- 没有 Website 字段 + 备用内容不为空 → 使用备用内容替代模板评论
- 没有 Website 字段 + 备用内容为空 → 仍使用模板评论（不影响原有逻辑）

---

### 32. 外链库区分「未发布」和「发布失败」状态，新增导出未发布链接功能

**修改文件**：
- `options/options.html` — 外链库工具栏新增「📤 导出未发布」按钮；下拉筛选框新增「未发布」和「发布失败」两个独立选项
- `options/options-backlinks.js` — 
  - 状态标签改为 `.bl-pending-tag`（未发布）和 `.bl-fail-tag`（发布失败）分开显示
  - `renderBacklinks()` 筛选逻辑优化，支持 `pending`（未发布）和 `failed`（发布失败）筛选
  - 新增 `exportPendingLinks(links, sites)` 函数，导出所有在所有目标网站都未发布的链接

**状态判断逻辑**：
- 未发布：所有目标网站都没有该链接的发布记录
- 发布失败：至少有一个目标网站有发布记录且 success=false
- 发布成功：至少有一个目标网站有发布记录且 success=true

**导出格式**：CSV 文件，包含 URL 和 Anchor Text 两列；文件名 `pending-links-{timestamp}.csv`

---

### 33. 加宽设置页面宽度，避免按钮文字换行

**修改文件**：
- `options/options.css` — 主内容区 `max-width` 从 800px 增加到 1200px

---

### 34. 优化 CSV 导入逻辑，只要表头包含 url 关键词即可导入

**问题**：原来只能识别表头名称精确匹配 `url`、`link` 等的列，导致很多第三方导出的 CSV 文件（如 `Source URL`、`Referring URL`）无法导入。

**修改文件**：
- `utils/helpers.js` — `parseCSV()` 新增 `urlColumnIndex` 查找逻辑：
  - 用 `findIndex` 找到第一个表头名称**包含** `url`/`link`/`外链`/`链接` 关键词的列（大小写不敏感）
  - 从该列提取 URL 数据，不再依赖字段名精确匹配
  - 如果找不到包含 url 的表头列，返回空数组并打印警告

**支持的表头示例**：`URL`、`Source URL`、`Page URL`、`Referring URL`、`Backlink`、`External Link`、`外链地址`、`链接地址`

---

### 35. 支持直接导入 Excel (.xlsx/.xls) 文件

**问题**：原来导入 xlsx 文件时直接提示「请先另存为 CSV 格式后导入」，无法实际解析 Excel 文件。

**修改文件**：
- `lib/xlsx.full.min.js` — 新增 SheetJS 库（v0.20.3，930KB），用于在浏览器端解析 Excel 文件
- `popup/popup.html` — 在 script 引用最前面加载 `../lib/xlsx.full.min.js`
- `utils/helpers.js` — 新增 `parseXLSX(file)` 方法：
  - 使用 `FileReader.readAsArrayBuffer` 读取文件
  - 调用 `XLSX.read()` 解析工作簿，取第一个 sheet
  - 用 `XLSX.utils.sheet_to_json()` 转为对象数组
  - 自动查找表头中包含 `url`/`link`/`外链`/`链接` 关键词的列（大小写不敏感）
  - 同时查找锚文本列（`anchor`/`锚文本`/`text`）
  - 返回格式与 `parseCSV` 一致的外链数组
- `popup/popup-collect.js` — `handleFileImport()` 中 xlsx/xls 分支改为调用 `Helpers.parseXLSX(file)`（原来是提示转 CSV）

**注意**：`manifest.json` 的 `web_accessible_resources` 已包含 `assets/*` 和 `lib/*`，无需额外修改。
