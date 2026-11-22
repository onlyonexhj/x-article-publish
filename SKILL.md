---
name: x-article-publish
description: Publish a local Markdown file as an X Article with native code blocks, tables, and headings. Use when the user asks to post a Markdown doc to X articles or fix broken article formatting. Do not use for tweets or threads.
---

# X Article 发布

把本地 Markdown 发布成 X「文章」，保留原生代码框、表格、标题层级和引用块。

## 核心结论

X 没有公开的文章 API。网页端用的是私有 GraphQL `ArticleEntityDraftCreate`。**在已登录的 x.com 页面上下文里直接 fetch 即可**，不需要导出 cookie：

- `ct0`（CSRF token）不在 HttpOnly，`document.cookie` 可读；
- `auth_token` 是 HttpOnly，但同源请求会自动携带；
- 页面上下文天然带 `x-client-transaction-id`，Node 端手搓反而会被拒。

不要走「HTML 粘贴进编辑器」的路线：`<pre>` 会被丢弃，每个代码行变成独立段落，行距巨大，格式全乱。

## 流程

1. 本地把 Markdown 转成 Draft.js `content_state`（用 `@kaitox/x-article`）
2. gzip + base64 分块注入页面（一次传入体量过大会报错）
3. 页面内 POST `ArticleEntityDraftCreate` 建草稿
4. 打开编辑器逐段目检
5. 发布，受众选「每个人」
6. 清理旧文章与测试草稿

## 步骤 1：转换

安装依赖（仓库自带 `package.json`，已锁 `0.6.0`；`0.6.2` 依赖了不存在的 `@kaitox/relay-protocol@^0.5.3`）：

```bash
npm install
```

用 [build-payload.mjs](scripts/build-payload.mjs) 生成 payload：

```bash
node scripts/build-payload.mjs "D:/path/to/doc.md" ./out
```

它会输出 `out/payload.json`、`out/payload.json.gz.b64`（base64）和 `out/chunks.json`，并打印块类型统计。确认这几项再往下走：

- `title` 等于文档第一个 H1；
- `atomic` 数量约等于代码围栏数 + 表格数；
- `entity_map` 里有 `MARKDOWN`（代码框/表格）、`LINK`、`DIVIDER`。

## 步骤 2-3：注入并建草稿

完整脚本见 [page-push.md](references/page-push.md)。要点：

- 分块大小 6000 字符，`window.__csB64 += '<chunk>'` 逐块累加，最后一次性 `atob` → `DecompressionStream('gzip')` → `JSON.parse`。
- 单次传入超过约 9 KB 会触发浏览器端 `ReferenceError`，所以必须分块。
- 页面内 fetch 的必需头：`authorization: Bearer <公开 bearer>`、`x-csrf-token: <ct0>`、`content-type: application/json`，并且 `credentials: 'include'`。
- `queryId` 会轮换（本次为 `g1l5N8BxGewYuCy5USe_bQ`）。失败时在 x.com 打开 DevTools Network，找 `ArticleEntityDraftCreate` 取路径里的 queryId 覆盖。
- 成功返回 `data.articleentity_create_draft.article_entity_results.result.rest_id`，那就是草稿 id。

## 步骤 4：目检

打开 `https://x.com/compose/articles/edit/<restId>`，至少检查：

- 首屏：大标题、作者卡片、引用块左侧竖线；
- 一个代码框：有语言标签（bash / ini / caddyfile）、等宽字体、复制按钮；
- 一个表格：原生表格边框，不是管道符文本；
- 文末：最后一段与作者简介完整。

有问题就直接删草稿重建，不要在编辑器里手改——重新生成的成本更低。

## 步骤 5：发布

- 点工具栏「发布」；
- 弹出「发布文章」对话框，受众默认已是「每个人」，回复权限保持默认；
- 点对话框里的「发布」（注意不是工具栏那个）；
- 成功后跳转到 `/status/<id>`，页面出现「成功！你的文章已发布」。

点击按钮优先按文本匹配 `button` 元素再 `.click()`；快照里同名按钮会出现两次（工具栏与对话框）。

## 步骤 6：清理

进入 `https://x.com/compose/articles` 管理：

- 删除一篇草稿/文章：打开编辑页 → 工具栏「更多」→ 菜单只有「删除文章」→ 确认「是的，删除」。
- 已发布的文章也一样走「删除文章」，X 没有「撤回成草稿」的路径，删除不可撤销。
- 只删本次自己创建的，用户历史草稿不要动。

## 关键坑

- **不要用 HTML 粘贴**：代码块必然散成段落，这是最典型的失败形态。
- **不要用 `execCommand('selectAll')` + 粘贴替换**：内容会翻倍。
- **不要给页面起本地 HTTP 服务再 fetch**：浏览器进程访问 `127.0.0.1` 会 `Failed to fetch`（混合内容/CSP），老老实实分块注入。
- **不要直接写编辑器 DOM**（`innerHTML` / `execCommand`）：React/Draft.js 状态不同步，保存后内容会丢或翻倍。
- 分块注入前先 `window.__csB64 = ''`，避免上一轮残留拼接。
- **图片不处理**：只传文本，Markdown 里的图片会丢。需要图片时得先走 X 的媒体上传拿 `media_id`，再放进 `content_state`。

## 校验清单

- [ ] `payload.json` 的 `title` 正确，`blocks` 数与原文结构相符
- [ ] 建草稿返回 200 且拿到 `restId`
- [ ] 编辑器里代码框与表格渲染正常
- [ ] 发布后 `/status/<id>` 可访问
- [ ] 旧文章与测试草稿已删除，用户原有草稿未被改动
