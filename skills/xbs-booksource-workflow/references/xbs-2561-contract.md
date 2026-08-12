# Xiangse 2.56.1 JSON Contract

Use this contract for delivery JSON. It targets text sources only.

## Required top-level shape

Wrap one source in one stable alias. A delivery JSON/XBS artifact must contain exactly one alias; split multiple sources into separate artifacts so every packaged source receives the same validation:

```json
{
  "example-v1": {
    "sourceName": "Example-v1",
    "sourceUrl": "https://example.com/",
    "sourceType": "text",
    "enable": 1,
    "weight": "9999",
    "lastModifyTime": "1772463417",
    "searchBook": {
      "actionID": "searchBook",
      "parserID": "DOM",
      "responseFormatType": "html",
      "requestInfo": "@js:return {'url': config.host + 'search?q=' + encodeURIComponent(params.keyWord)};",
      "list": "//ul[@id='result']/li",
      "bookName": "//a/text()",
      "detailUrl": "//a/@href"
    },
    "bookDetail": {
      "actionID": "bookDetail",
      "parserID": "DOM",
      "responseFormatType": "html",
      "requestInfo": "%@result",
      "title": "//h1/text()",
      "cover": "//img[@class='cover']/@src",
      "desc": "//div[@class='intro']/text()"
    },
    "chapterList": {
      "actionID": "chapterList",
      "parserID": "DOM",
      "responseFormatType": "html",
      "requestInfo": "%@result",
      "list": "//div[@id='chapters']/a",
      "title": "//text()",
      "url": "//@href",
      "detailUrl": "//@href"
    },
    "chapterContent": {
      "actionID": "chapterContent",
      "parserID": "DOM",
      "responseFormatType": "html",
      "requestInfo": "%@result",
      "content": "//div[@id='content']/text()"
    }
  }
}
```

Replace every placeholder selector and URL with values proven against the target site.

## Field requirements

- `sourceType`: exactly `"text"`. Official-exported samples include sources without `sourceType` (the app defaults to text), but the delivery contract still requires the explicit `"text"` value (fail-closed).
- `enable`: integer `1` or `0` (official samples: all integer).
- `weight`: positive integer string, normally `"9999"`. Official samples are mixed (`"109"`/`"666"` strings and integer `100`); the string form is the editor-save-safe contract (see the 2026-03-10 crash retrospective).
- `lastModifyTime`: string; official samples include both integer and float-string forms (`"1773148185.456299"`). Either is accepted; keep the delivered form consistent after roundtrip.
- `miniAppVersion`: optional top-level field; every official-exported sample carries one (e.g. `"2.53.2"`), and 2.56.1 keeps it compatible.
- Empty placeholder actions are legal in official exports: `shudanList: {}` (fully empty) and `{actionID, parserID}` shells for `shupingList`, `relatedWord`, `searchShudan`, `shudanDetail`, `shupingHome`. They are optional; omit them unless the site actually supports the feature.
- Each core action: object containing `actionID`, `parserID`, string `requestInfo`, and `responseFormatType`.
- Core actions: `searchBook`, `bookDetail`, `chapterList`, `chapterContent`.
- `parserID`: the app schema recognizes `DOM` and `JS`. The bundled validator currently executes `DOM` only; `JS` is reported as unsupported/blocked and cannot receive an automated pipeline pass.
- `responseFormatType`: one of `""`, `base64str`, `html`, `xml`, `json`, or `data`. Never use `text`.
- `responseDecryptType`: `""` or `encryptType1` only when verified.

The schema whitelist describes app-shaped data, not the validator's full execution ability. Automated live execution currently supports `DOM` with `html` or `json`; other schema-valid response formats remain an incomplete automation case.

## Request contract

Use `config`, `params`, and `result` in `@js:` rules.

Use these request object keys:

- `url`
- `POST`
- `httpParams`
- `httpHeaders`
- `forbidCookie`
- `forbidCache`
- `cacheTime`
- verified WebView keys when necessary

Do not use:

- `java.getParams()`
- `method`
- `data` or `body`
- `headers`
- Legado top-level keys such as `bookSourceName` or `bookSourceUrl`

A `@js:` requestInfo may return an object that overrides per-step response handling. Verified in the modified 2.56.1 sample (`百度小说` official-exported source): `responseFormatType` inside the returned object wins for that step. `responseEncode` and `requestParamsEncode` follow the same object-level override.

## Encoding fields (editor standard, verified in `lpnet_modelInfo`)

These are editor-level fields of the action panel, confirmed by `Tg@TrollstoreKios.app/lpnet_modelInfo`:

| Field | Values | Meaning |
|---|---|---|
| `requestParamsEncode` | `""` (utf-8), `"2147485234"` (gbk) | request parameter encoding |
| `responseEncode` | `""` (utf-8), `"2147485232"` (gb2312), `"2147485234"` (gbk) | response body encoding |

GBK/GB2312 sites must set the matching `responseEncode`; the bundled validator decodes these with `TextDecoder`. GBK POST parameter encoding is not yet supported by the validator and is reported as an unsupported capability (`requestParamsEncode=gbk(POST)`).

## Runtime objects (`config`, `params`, `result`)

JS rules run inside `function functionName(config, params, result) { ... }` (string confirmed in the 2.56.1 binary).

- `config.host` resolves to the action-level `host` field, falling back to `sourceUrl`. Every action may carry its own `host`.
- `config.httpHeaders` merges source-level and action-level `httpHeaders`.
- `params.keyWord` — search keyword.
- `params.pageIndex` — current page (starts at 1).
- `params.offset` / `params.filter` — legacy paging/filter hints. **`params.filter` carries the selected category value when the user taps a `bookWorld` category in the app UI** (verified live 2026-08-12 in the official app: tapping 都市 sent `params.filter="3"`). The editor test panel sends both `filters.category` and `filter`.
- `params.filters.<key>` — category filter value; the key matches the `requestFilters` key name (e.g. `category`, `type`, `_type`, `classId`, `cat`). The editor test panel populates this; prefer `params.filter` first for UI taps, then fall back to `filters.category`:
  ```js
  @js:
  var cat = '1';
  if (params && params.filter) cat = String(params.filter);
  else if (params && params.filters && params.filters.category) cat = String(params.filters.category);
  ```
- `params.queryInfo` — selected item of the previous step; carries `url`, `detailUrl`, and parsed fields. This is the primary channel for chained URL propagation.
- `params.responseUrl` — URL of the last response.
- `params.lastResponse` — last response object (e.g. `params.lastResponse.nextPageUrl`).
- `params.requestInfo` — current action's requestInfo (verified in an official-exported source: `detailUrl: "@js: return params.requestInfo;"`).
- `params.requestUrls` — accumulated request URLs during WebView navigation (log string present in the binary).
- `params.nativeTool` — LCJSTool bridge (`base64EncodeWithData`, `dataByAesDecryptWithBase64StringWithKeyWithIv`, `md5Encode`, `sha1Encode`, `cookieByKey`, `getCache`, `set:cache:`, `readFile`, `unzipFile`, `XPathParserWithSource`, etc.), confirmed via the `LCJSToolExports` JSExport protocol in the modified sample and used by an official-exported source (百度小说). Official unmodified-app availability is not yet proven; do not make it the primary path without an official-app runtime test.
- `result` — data passed into the action from the previous step.

**`bookWorld` requestInfo must not reference `config.httpHeaders`.** In the app runtime the `config` object exposed to a category action may lack fields the validator provides; referencing a missing property throws in the JS engine and the request fails (observed as `Request failed: not found (404)` in the app test panel while the validator passed). Return a plain string URL built from `params` only (as every official-exported category action does).

## Search-disabled sites

Some sites disable site search entirely (observed: 95txt.com `/search/` returns an alert "管理员已关闭此功能"; novel543.com search is Cloudflare-protected). When search is unusable:

- Keep the `searchBook` action present (the contract requires it) but have its `requestInfo` request a stable browsable page instead of a keyword route — e.g. a category page (`/fenlei/5/1/`), documenting the degradation in `desc`.
- Implement the real browsing surface in `bookWorld` categories.
- The validator fixture/live chain still passes: search returns the category list, detail/catalog/content follow from the first item.

JSONPath fields use the SMJJSONPath syntax (prefix `$`, e.g. `$.data.list`; official samples also use bare keys like `data/novelList` for the `list` expression).

## XPath to JS pipe (`||`)

A field may combine an XPath/JSONPath source with a JS transform: `"//a/text()||@js:return String(result || '').trim();"`. The selector result is passed in as `result`, and the JS return value becomes the field value. The pipe also accepts a JSONPath base for `json` responses. This pattern is used by every verified source in `tools/verification/` and is the recommended way to normalize whitespace or pick one URL from a concatenated attribute.

## Editor compatibility

- Use a category map for `bookWorld`; never use `bookWorld.categories` as an array. Each entry may carry `_sIndex` (ordering, verified in official-exported sources).
- **`bookWorld` is required for source visibility.** Live-app evidence (2026-08-12, StandarReader 2.56.1 via PlayCover): 9/9 sources visible in the source-manager and discovery UI carry `bookWorld`; a delivery without `bookWorld` did not appear in either list. Treat `bookWorld` (with at least one category action) as mandatory for every deliverable, even for pure search-only sources.
- Store `bookWorld.*.moreKeys.requestFilters` as the legacy string form. Non-string values are a high-risk editor-save input in 2.56.1. Verified: every source exported from the official app (`tools/verification/mac_live_sourceModelList.json`: 精华书阁, 80zw小说, 百度小说, ttks.tw, 雪飞阁) uses the string form, e.g.:
- Prefer an empty string for optional `validConfig` unless a verified rule requires more.
- Keep JS compatible with the app's proven engine. Prefer `var` and ordinary functions; avoid optional chaining, nullish coalescing, and unverified browser globals.

Example string filter:

```text
category
玄幻::xuanhuan
都市::dushi
```

## XPath rules

For list child fields in this target, prefer the verified double-slash forms:

- `title`: `//text()`
- `url`: `//@href`
- `detailUrl`: `//@href`

Avoid `./` and `.//` in list children. Still inspect the actual App result: the validator's DOM implementation can differ from the app's parser.

`requestFilters` string layout (key on the first line, then `标题::值` lines):

```text
category
玄幻::xuanhuan
都市::dushi
```

## Decryption and WebView boundary

Do not infer official runtime APIs from files or strings found in the modified reverse sample.

- A bundled `crypto.min.js` does not prove `CryptoJS` is globally available to source rules in the official app.
- Do not assume `atob`, `CryptoJS`, `wkwebview_post`, `webViewSniff`, or LCJSTool methods work in a rule unless the official app runtime test demonstrates that exact path.
- Prefer a stable documented API response over copied WAF or challenge scripts.
- If decryption cannot be proven in live simulation and the official app, report `blocked` or `fail`.
