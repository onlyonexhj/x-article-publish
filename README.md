# x-article-publish

一个 Trae / Claude Skills 技能：把本地 Markdown 发布成格式完整的 X（Twitter）文章，保留原生代码块、表格、标题层级和引用块。

## 它解决什么问题

X 没有公开的文章发布 API。常见做法是把 HTML 粘贴进编辑器，但 X 会丢弃 `<pre>`，导致每个代码行变成一个独立段落、行距巨大、排版全乱。

本技能改走 X 网页端自己使用的私有 GraphQL 接口 `ArticleEntityDraftCreate`：

- Markdown 先经 `@kaitox/x-article` 转成 Draft.js `content_state`，代码围栏和表格变成 X 原生 `MARKDOWN` block；
- 在已登录的 x.com 页面上下文里同源 `fetch`，`ct0` 从 `document.cookie` 读取，`auth_token` 随请求自动携带，无需导出任何 cookie；
- 大体积 payload 用 gzip + base64 分块注入页面，规避参数上限。

## 目录

```text
.
├── SKILL.md              # 技能本体：流程、关键坑、校验清单
├── scripts/
│   └── build-payload.mjs # Markdown → content_state → gzip 分块
├── references/
│   └── page-push.md      # 页面注入与建草稿的完整脚本
└── LICENSE               # MIT
```

## 使用

1. 把整个目录放到你的 skills 目录，例如：
   - 项目级：`<project>/.trae/skills/x-article-publish/`
   - 全局：`~/.trae-cn/skills/x-article-publish/`
2. 安装依赖（仓库自带 `package.json`，版本已锁定）：

```bash
npm install
```

> 必须锁 0.6.0：0.6.2 依赖了不存在的 `@kaitox/relay-protocol@^0.5.3`。

3. 生成 payload：

```bash
node scripts/build-payload.mjs ./your-doc.md ./out
```

4. 按 `SKILL.md` 的步骤注入页面、建草稿、目检、发布。

## 适用与不适用

- 适用：把 Markdown 长文发到 X「文章」；修复已发布文章排版错乱。
- 不适用：普通推文、推文串、X 以外的平台。

## License

[MIT](LICENSE) © 2026 onlyonexhj
