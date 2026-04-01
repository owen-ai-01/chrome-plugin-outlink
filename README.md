# chrome-plugin-outlink
Chrome plugin for outlink handling.

## V0.1 功能
- 4 个主 tab：`收集`、`发布`、`日志`、`资源库`（后 3 个先保留占位）
- 收集页支持：
  - 输入目标域名
  - 点击“开始收集”自动打开 Semrush / Ahrefs 分析页
  - 实时显示统计：`已发现外链数`、`已分析数量`、`博客评论资源`、`队列中`
- 在 Semrush/Ahrefs 页面拦截相关 JSON 请求，抽取 URL 并回写本地存储队列

## 本地加载
1. 打开 Chrome 扩展管理页：`chrome://extensions/`
2. 开启开发者模式
3. 点击“加载已解压的扩展程序”，选择项目目录：`D:\code\chrome-plugin-outlink`
4. 固定插件图标后，打开弹窗即可看到面板

## 说明
- 本版本先打通“收集”主链路，便于验证自动发现外链。
- 资源持久化使用 `chrome.storage.local`，后续可替换为更完整的数据层或同步到 Google Sheet。
