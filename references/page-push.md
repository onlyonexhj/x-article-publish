# 页面上下文注入与建草稿

前提：内部浏览器已登录 x.com。所有调用都通过 code_mode 的 `Exec` 执行，浏览器工具参数名是 `script`（不是 `function`），回传用 `text()`，Exec 顶层不能 `return`。

## 1. 逐块注入 base64

先读 `chunks.json`。`Exec` 运行在 V8 沙箱里，**没有 Node 的 `fs`**，所以要用 Shell 读出内容再作为字面量传进 `Exec`：

```powershell
# Shell：确认分块数量与每块长度
Get-Content out/chunks.json -Raw | ConvertFrom-Json | ForEach-Object { $_.Length }
```

```js
// Exec：chunks 为上面从 chunks.json 读到的 base64 字符串数组
await tools.browser_evaluate({ script: `window.__csB64 = ''; 'reset'` });

for (const chunk of chunks) {
  await tools.browser_evaluate({
    script: `window.__csB64 += ${JSON.stringify(chunk)}; window.__csB64.length`
  });
}
```

单块保持 6000 字符左右。超过约 9 KB 时浏览器端会抛 `ReferenceError`，且粘贴/注入行为不可预期。

## 2. 解压并创建草稿

最后一块注入完，执行下面这段（`QUERY_ID` 失效时替换）：

```js
const QUERY_ID = 'g1l5N8BxGewYuCy5USe_bQ';

const script = `(async () => {
  const bin = atob(window.__csB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const obj = JSON.parse(await new Response(stream).text());

  const ct0 = (document.cookie.split('; ').find((c) => c.startsWith('ct0=')) || '').slice(4);
  if (!ct0) return JSON.stringify({ error: 'no ct0 cookie, not logged in' });

  const body = {
    variables: { content_state: obj.content_state, title: obj.title },
    features: {
      profile_label_improvements_pcf_label_in_post_enabled: false,
      responsive_web_profile_redirect_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      verified_phone_label_enabled: false,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true
    },
    fieldToggles: { withPayments: false, withAuxiliaryUserLabels: false },
    queryId: '${QUERY_ID}'
  };

  const res = await fetch(
    'https://x.com/i/api/graphql/${QUERY_ID}/ArticleEntityDraftCreate',
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
        'x-csrf-token': ct0,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'content-type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(body)
    }
  );

  const txt = await res.text();
  const out = { status: res.status, blocks: obj.content_state.blocks.length, title: obj.title };
  try {
    const j = JSON.parse(txt);
    const r = j?.data?.articleentity_create_draft?.article_entity_results?.result;
    out.restId = r?.rest_id;
    if (!out.restId && r?.id) out.decodedId = atob(r.id);
    if (!r) out.body = txt.slice(0, 600);
  } catch {
    out.body = txt.slice(0, 600);
  }
  return JSON.stringify(out);
})()`;

const r = await tools.browser_evaluate({ script });
text(JSON.stringify(r));
```

`restId` 即草稿 id，编辑页为 `https://x.com/compose/articles/edit/<restId>`。

## 3. 常见返回

| status | 现象 | 处理 |
|---|---|---|
| 200 且有 `restId` | 成功 | 打开编辑页目检 |
| 200 但 `body` 含 `GRAPHQL_VALIDATION_FAILED` | content_state 含非法字段或枚举 | 检查 block 是否带 `depth`、inline style 是否越界 |
| 200 但 `body` 含 `OperationalError` | 用了 X 不支持的 block 类型 | `header-three` / `code-block` 降级为 `header-two` / `unstyled` |
| 404 | queryId 已轮换 | 抓包取新 queryId |
| 403 | 未登录或 ct0 失效 | 重新登录内部浏览器 |

## 4. 失败时不要做的事

- 不要改回「HTML 粘贴进编辑器」；
- 不要在页面里起本地服务再 fetch（`Failed to fetch`）；
- 不要用 headless 方式直接替换编辑器 DOM，React 状态会丢。
