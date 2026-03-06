---
name: xbs-booksource-workflow
description: Build, debug, and maintain 香色闺阁/香色书源 JSON and XBS files. Use when users ask to create or fix book sources, convert between xbs and json, debug empty parsed fields, validate XPath and JS parser rules, or produce import-ready XBS outputs for the app.
---

# XBS Booksource Workflow

## Overview

Implement or fix text book sources for 香色闺阁-compatible formats with a deterministic workflow: analyze target pages, generate rule JSON, convert to XBS, and validate with real HTML samples.

## Workflow

1. Inspect source format and goal.
2. Build or repair JSON rules.
3. Validate selectors with real HTML.
4. Convert JSON to XBS.
5. Verify roundtrip and provide checksum.

## Step 1: Inspect Input and Site

- Confirm whether input is `.json` or `.xbs`.
- For new source rules, fetch and inspect:
  - search page
  - detail page
  - chapter list page
  - chapter content page

## Step 2: Build or Repair JSON Rules

Minimum required actions:

- `searchBook`
- `bookDetail`
- `chapterList`
- `chapterContent`

Required action fields:

- `actionID`
- `parserID`
- `responseFormatType`
- `requestInfo`

Prefer:

- `parserID: DOM`
- `requestInfo: @js:` (avoid legacy JS callback fields unless required)
- `weight` must be in `1..9999` (new app versions treat `0` as unavailable)
- Priority semantics: larger `weight` means higher source priority
- If using template `requestInfo`, support placeholders: `%@result`, `%@keyWord`, `%@pageIndex`, `%@offset`, `%@filter`
- For chapter pagination requests, prioritize:
  - `params.lastResponse.nextPageUrl`
  - then `result`
  - then `params.queryInfo.url`
- When next-page URLs are relative, resolve with `params.responseUrl` first, then `config.host`
- Use `moreKeys` when needed:
  - `requestFilters` for category/sort filters
  - `removeHtmlKeys` for html/script cleanup
  - `skipCount` for list head trimming
  - `pageSize` or `maxPage` for pagination control
- For paged `chapterContent`, set `maxPage` in both:
  - `chapterContent.validConfig`
  - `chapterContent.moreKeys`

实战补充（2026-03，deqixs）:

- Search 中文关键词优先 `GET + encodeURIComponent(params.keyWord)`；部分客户端 `POST` 中文参数会有编码不一致问题。
- Search 需要兼容“双形态响应”：
  - 模糊词返回列表页；
  - 精确词可能直接返回详情页（无 list）。
- 当 `searchBook.list` 已命中单条书籍节点时，`detailUrl` 优先使用 list 上下文相对字段，不要先用页面级 canonical/meta 覆盖。
- 为兼容“直达详情页”场景，可额外增加 `url` 兜底字段（canonical/meta），供后续 `bookDetail/chapterList/chapterContent.requestInfo` 回退取值。
- `bookWorld` 分类页默认按 `pageIndex` 单页请求；不要默认启用 `nextPageUrl + 超大 maxPage` 自动连翻，否则容易超时或卡住。
- `requestInfo` 里 URL 清洗避免易错正则写法 `replace(/\\//g,'/')`；推荐 `String(u).split('\\\\/').join('/')`。
- 正文链路先判定是否“接口二跳”：
  - 若站点是 `chapter.js.php -> ajax2.php` 这类 token 换正文接口，优先走接口，不默认上 `webView`。
  - 仅在接口链路不可行时，才使用 `webView + webViewJs` 回填。
- deqixs 类接口务必在第二跳请求头里显式注入：
  - `X-Requested-With: XMLHttpRequest`
  - `Referer: 当前章节 URL`
  否则常见返回：`仅支持网页端访问` / `不支持该客户端访问`。
- `chapterContent.content` 禁止“检测到 chapterToken 就直接 return ''”：
  - 混合响应（token脚本 + JSON）会被误杀，导致 `status=1` 但正文空。
  - 必须先尝试 JSON 解析，再做正则兜底提取 `content`。

实战补充（2026-03，66shuba）:

- API-first 站点优先全链路走 JSON 接口，不要优先依赖详情/阅读页 DOM。
- 常用链路：
  - search: `/api/novel/search`
  - detail: `/api/novel/detail/{bookId}`
  - catalog: `/api/novel/catalog/{bookId}`
  - chapter: `/api/novel/chapter/{bookId}/{chapterId}`（VIP 用 `vip-chapter`）
- `searchBook.list` 若是卡片嵌套结构（`CardList -> Body -> ItemData`），在 `list || @js` 中扁平化并过滤 `ItemType===0`。
- `chapterList.list` 必须过滤哨兵章节（如 `C=-10000`），通用规则：仅保留正整型章节 id。
- `chapterContent` 请求建议从 read URL 反解 `bookId/chapterId` 再组 API URL，减少上下游 URL 形态差异影响。
- 验证正文时增加“占位正文识别”：
  - 若返回 `code=0` 但 `content` 为“网络开小差了，请稍后再试”等提示语，判定为上游异常，不是规则成功。

实战补充（2026-03，sudugu）:

- 章节页常见“上一章/目录/下一页(或下一章)”共用同一 `prenext` 结构：
  - 不要仅靠文字匹配 `contains(text(),'下一页')`；
  - 优先取“右侧固定位”链接（如 `span[2]/a/@href`），再做 JS 守卫判定。
- 正文分页守卫推荐通用规则：
  - 解析当前 URL 和候选 URL 为 `/{bookId}/{chapterId}(-{page})?.html`
  - 仅当 `bookId` 相同、`chapterId` 相同、`nextPage > currentPage` 时继续翻页
  - 其它情况（下一章、目录、回详情）一律返回空，禁止误翻。
- 目录分页与分类分页不要猜 URL 形态：
  - 目录页可能是 `p-2.html#dir`
  - 分类页可能是 `/xuanhuan/2.html`（而不是 `/xuanhuan/p-2.html`）
  - 必须基于真实下一页链接或已验证模板构造。

实战补充（2026-03，shuhaoxs）:

- 站内搜索入口可能被外部站接管（如首页直接跳 `rrssk`）：
  - 先验证本域 `index.php?action=*` 是否存在可用搜索接口；
  - 若大多为 `404`，判定“无稳定站内搜索接口”。
- 外部搜索若为“关键词加密 + 结果链接加密 + 前端解密跳转”链路（`toUrl/openUrl`），默认不要直接作为主搜索方案：
  - 尤其是解密依赖 `CryptoJS + UA + 动态页面变量` 时，客户端运行时不一定可复现。
- 外部链路不稳定时，优先提供可用降级：
  - `searchBook` 改为“分类页遍历 + 关键词字段过滤”；
  - 明确这是 fallback 搜索，并在交付说明中标注精度限制。
- `bookDetail` 优先使用页面 `og:*` 元数据（`book_name/author/category/status/update_time/latest_chapter_name/url/image`），再回退 DOM 字段。
- `chapterList` 若走 `index.php?action=loadChapterPage&id={aid}&page={n}`：
  - 需处理“越界页重复最后一页”与“短书重复第 1 页”现象；
  - 不要仅凭 `data.length > 0` 继续翻页；
  - 建议按 `chapterorder` 校验当前页范围（每页 100：`1-100/101-200/...`）并据此决定 `list` 与 `nextPageUrl`。
- `chapterContent.nextPageUrl` 继续使用同章分页守卫：
  - 仅允许 `/book/{aid}-{cid}-{p}.html` 且 `aid/cid` 相同、`p` 递增；
  - 命中“下一章/目录/回详情”一律返回空。

实战补充（2026-03，bxwx）:

- 搜索接口存在站点级限流：`POST /search.html` 连续请求会返回“搜索间隔为30秒，请稍后在试！”页面。
  - 这属于上游限流，不是解析失败；
  - 调试与验证需加节流/重试（至少间隔 30 秒）或使用本地 fixture。
- 搜索表单字段需精确匹配：
  - `searchtype=all`
  - `369koolearn=<keyword>`
- `bookDetail` 常见 `og:novel:read_url` 直接给目录页（`/dir/{aid}/{bid}.htm`），不是阅读入口：
  - `chapterList.requestInfo` 需同时兼容 `/b/{aid}/{bid}/` 与 `/dir/{aid}/{bid}.htm` 两种输入。
- 分类页真实路径为 `/bsort{n}/`（如 `/bsort1/`），不要套用其他站点的 `/xuanhuan/2.html` 模板。
  - `bookWorld` 默认按单页处理（`maxPage=1`），避免盲翻到空页/错误页。
- 分类列表节点可直接使用 `#newscontent .l ul li`：
  - 书名：`span.s2 a`
  - 作者：`span.s4`
  - 分类：`span.s1`（需去 `[]`）
  - 更新时间：`span.s5`
- 正文分页继续使用“同章守卫”：
  - `#pager_next` 在末页常直接跳下一章（非下一页）；
  - 仅允许 `/b/{bookId}/{chapterId}(_{page})?.html` 且页码递增。
- 正文需清洗分页提示与推广尾巴（常见文案）：
  - “这章没有结束…下一页继续阅读…”
  - “小主子…下一页继续阅读…”
  - “喜欢…请大家收藏…更新速度全网最快”

实战补充（2026-03，libahao）:

- 香色闺阁里 `list` 子字段 XPath 统一用 `//` 开头，禁用 `./...` 与 `.//...`。
  - 错误高发写法：`./td[2]/a/text()`、`./td[3]/a/text()`、`./td[2]/a/@href`
  - 推荐：`//td[2]/a/text()`、`//td[3]/a/text()`、`//td[2]/a/@href`
- 能直接取目标字段时，不写“复杂拼接式 JS”：
  - 例如 `detailUrl/url` 直接用 `//td[2]/a/@href`，避免多余绝对化逻辑引入噪声。
- 列表字段禁止抓整行文本再拆分：
  - 不要把 `status/desc/wordCount` 绑定到整段 `tr` 文本；
  - 采用“列到字段”的窄 XPath，一列一个字段。
- 所有文本字段默认做空白归一：
  - `String(result || '').replace(/\\s+/g, ' ').trim()`
  - 分类名额外去方括号：`.replace(/[\\[\\]]/g, '')`
- 分类页无 `<img>` 时，允许由 `detailUrl` 反推封面：
  - `/book/{aid}_{bid}/` -> `/data/image/{bid}.jpg`
  - 该策略用于 `bookWorld.cover`，可显著减少“分类封面为空”。

## Step 3: Selector Validation (Critical)

Validate selectors against saved HTML (e.g., `xmllint --html --xpath ...`).

香色闺阁兼容重点:

- If `listLengthOnlyDebug > 0` but fields are empty, change child selectors from `.//...` to `//...`.
- This parser may not reliably honor relative XPath context under `list`.
- In 香色 runtime, avoid `./...` in list child fields as well; prefer `//...` for stability.
- If runtime context is unclear, use JS debug return shape:
  - `return {"config": config, "params": params, "result": result};`
- Remember `result` changes by stage:
  - in `requestInfo`: upstream URL or `nextPageUrl`
  - in parse stage: previous-layer parsed value
- If chapter body is rendered by JS (`document.writeln(base64...)`), decode in `content || @js:` and add guarded `nextPageUrl` for same-chapter pagination.
- Guarded next-page rule is mandatory:
  - parse current URL + candidate next URL as `/baidu/{aid}/{cid}(_{page})?.html`
  - continue only if `aid` same, `cid` same, and `nextPage > currentPage`
  - never guess `_1/_2` blindly when no hard evidence exists
- If old client fails with `content || @js:` (script stripped in DOM), switch to legacy-compatible parsing:
  - `chapterContent.parserID = JS`
  - `chapterContent.responseFormatType = ''` (plain string)
  - decode body in `responseJavascript(config, params, resStr)` from raw response text.
- Use old-engine-safe JS for compatibility:
  - prefer `var` + `function`
  - avoid `new URL()`, optional chaining, nullish coalescing

See detailed pitfalls: [references/xiangse-parser-pitfalls.md](references/xiangse-parser-pitfalls.md).

## Step 4: Convert Between JSON and XBS

Use either:

- `xbsrebuild xbs2json/json2xbs`
- Python fallback implementing XXTEA + appended plain-length tail

XXTEA details are documented in [references/xbs-xxtea-format.md](references/xbs-xxtea-format.md).

## Step 5: Output Contract

When delivering results, always provide:

- absolute path to JSON
- absolute path to XBS
- SHA256 of XBS
- brief debug note if any compatibility workaround was applied

## Do/Don't

Do:

- Keep `enable` as numeric `1/0`.
- Keep `weight` in `1..9999` (recommend `100`, use `9999` for highest priority).
- Set `lastModifyTime` as Unix seconds string (not date text), e.g. `"1772463417"`.
- Keep rules minimal and testable.
- Verify with at least one real query and one real chapter.
- For chapter pagination, verify at least two chapter samples:
  - one truly paged chapter (should continue to `_1`, etc.)
  - one non-paged chapter (must stop, no fake `_1`)
- For media links in chapter content, return object with dynamic headers when required:
  - `{"url": result, "httpHeaders": {...}}`

Don't:

- Keep legacy callback fields by default (`requestJavascript`, `responseJavascript`, `requestFunction`, `responseFunction`), unless required for old-client compatibility.
- Assume `.//` behaves correctly in app runtime.
