# chrome-plugin-outlink
Chrome plugin for outlink handling.

## V0.2 收集功能（仅 Ahrefs）
- 面板改为 `Chrome Side Panel`，点击插件图标后在浏览器侧边栏常驻，切换 tab 不会消失。
- 点击“开始收集”后会自动打开：
  - `https://ahrefs.com/backlink-checker/?input=<domain>&mode=subdomains`
- 收集链路：
  - 在 Ahrefs 页面拦截网络响应（JSON）
  - 同时抓取页面表格行（DOM）
  - 尝试自动翻页抓取后续页面
- 收集结果进入 `resources` 表并在收集页实时展示表格。
- 当前版本只做 Ahrefs Backlink Checker，不处理 Semrush。

## 固定URL发布（Product Hunt）
- 新增 `固定URL发布` tab，可配置 OpenRouter：
  - API Key
  - 模型（默认 `google/gemini-2.0-flash-001`）
- 输入目标 URL 后可：
  - `AI 生成文案`（name/tagline/description/first comment/topics）
  - `打开 Product Hunt 并自动填表`
- 可勾选“自动点击发布按钮”（谨慎开启，建议先人工确认）。

## 非 SPAM 筛选逻辑（当前规则）
- 命中敏感垃圾词（casino/porn/viagra/...）加分（更偏 spam）
- 可疑 TLD（.xyz/.top/.click/...）加分
- 模板化垃圾模式（cheap/free-money/bonus）加分
- DR 很低加分，DR 高减分
- 估算流量为 0 加分，流量较高减分
- 最终 `spamScore < 40` 判定为非 SPAM

## “不用注册的博客评论外链”候选标准（当前规则）
- URL 命中博客评论特征：`comment/replytocom/leave-a-reply/...`
- 且不命中登录注册特征：`wp-login/signin/signup/register/...`
- 命中强特征（如 `replytocom`）则标记“免注册候选”
- 其他博客文章型 URL 标记“需人工确认”

## 本地加载
1. 打开 `chrome://extensions/`
2. 开启开发者模式
3. 点击“加载已解压的扩展程序”，选择目录 `D:\code\chrome-plugin-outlink`
4. 点击插件图标后，面板会在浏览器侧边栏打开

## 数据持久化与备份
- 日常数据默认保存在本机浏览器的 `chrome.storage.local` 中。
- 面板支持：
  - `导出JSON`：把全部数据导出为 JSON 到你的电脑
  - `导出XLSX`：把资源库导出为表格文件
  - `导入备份`：支持导入 `.json/.xlsx/.csv/.tsv`
- 导入表格时：
  - 如果有表头，会按列名映射字段
  - 如果没有表头，会按默认列顺序导入（Type, URL, Domain, Discovered From, Has Captcha, Link Strategy, Link Format, Has URL Field, DR, Traffic, SPAM, 博客评论, 免注册候选）
- 建议定期导出备份，避免卸载扩展或重装浏览器后数据丢失。
- 备份 JSON 中会包含发布配置（含 API Key），请妥善保管。

## 说明
- 当前是规则筛选 + 候选判断，适合先完成收集闭环。
- 后续可接入：资源人工审核、自动发布队列、Google Sheet 同步。
