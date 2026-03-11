# Maintenance Workflow

## 1. 开发阶段
- 在 `sources/testing/<site>/` 新建或修改 json。
- 使用 `samples/html/<site>/` 做选择器验证。
- 章节节点优先规则：
  - `list` 命中章节节点后，默认 `//text()` + `//@href`。
- 香色 XPath 兼容约束：
  - `list` 子字段 XPath 禁用 `./...` 与 `.//...`，统一使用 `//...`。
- 搜索规则新增检查：
  - 中文关键词是否正确返回（建议 GET + `encodeURIComponent`）。
  - 是否存在搜索限流提示页（如“搜索间隔为30秒，请稍后在试！”）：
    - 若命中，判定为上游限流，不按“规则失败”处理；
    - 需等待限流窗口后重试，或切换 fixture 验证。
  - 是否存在“精确命中直达详情页”，若存在需补 `queryInfo.url` 兜底字段。
  - 若站点为 API-first（页面主要靠 JS 拉接口），优先直接使用 `/api/...` 作为主链路。
  - 若首页搜索跳外部域，必须确认是否为“加密搜索 + 加密跳转链接”：
    - 若运行时不可稳定解密，默认采用站内 fallback 搜索（分类遍历 + 关键词过滤）。
- 分类规则新增检查：
  - `bookWorld` 优先按 `pageIndex` 单页请求。
  - 默认不启用 `nextPageUrl` 连翻，先保证首屏稳定返回。
  - 分类分页 URL 必须实测确认（如 `/{cat}/2.html` vs `/{cat}/p-2.html`），禁止猜测路径模板。
  - 若站点分类无稳定翻页（第 2 页为空或错误页），将 `maxPage` 固定为 1 并在说明中标注。
  - 若分类页无封面节点但详情链接可反解书籍 ID，优先补“URL 反推封面”策略（如 `.../book/{aid}_{bid}/ -> /data/image/{bid}.jpg`）。
- 正文规则新增检查：
  - 先判定正文是“DOM直出”还是“接口二跳（token -> ajax）”。
  - 若是“单跳 JSON 正文接口”（如 `/api/novel/chapter/{bookId}/{chapterId}`），不要再绕 DOM/webView。
  - 若为接口二跳，`chapterContent.requestInfo` 必须显式处理：
    - `params.lastResponse.nextPageUrl` 优先
    - 动态请求头（如 `X-Requested-With`、章节页 `Referer`）
    - `params.responseUrl` 兜底
  - 若是 DOM 分页章节，`chapterContent.nextPageUrl` 必须加“同章分页守卫”：
    - 仅允许 `bookId/chapterId` 相同且分页号递增的 URL 进入下一轮请求。
  - 若章节目录使用分页接口（如 `loadChapterPage`）：
    - 需检查“越界页是否重复返回末页”；
    - 需检查“短书在 `page>=2` 是否重复返回第 1 页”；
    - `nextPageUrl` 判定要叠加 `chapterorder` 页范围校验，不能只看 `list.length`。

## 2. 转换与验证
- 转换前先执行 schema 体检（硬门槛）：
  - `python tools/scripts/check_xiangse_schema.py <input.json>`
  - 若失败，先修结构，不进入 `json2xbs`。
- 转换前执行编辑兼容体检（StandarReader 2.56.1）：
  - `python tools/scripts/xbs_tool.py check-editor -i <input.json>`
  - 若失败（高风险），先产出 editor-safe 版本：
    - `python tools/scripts/xbs_tool.py profile -i <input.json> -o <editor_safe.json> --profile editor_safe`
  - 兼容底线：`weight` 必须为整数字符串（默认 `"9999"`）
  - 若线上崩溃日志出现 `-[__NSCFNumber length]`，优先判定为字段类型错配，先排查 `weight` 是否为数字。
- 优先使用跨平台入口：
  - `python tools/scripts/xbs_tool.py json2xbs -i <input.json> -o <output.xbs>`
  - `python tools/scripts/xbs_tool.py xbs2json -i <input.xbs> -o <output.json>`
  - `python tools/scripts/xbs_tool.py roundtrip -i <input.json> -p <prefix>`
- Windows 开箱即用（无 Go）：
  - 默认使用内置二进制：`tools/bin/windows/xbsrebuild.exe`
  - CMD 入口：`json2xbs.cmd / xbs2json.cmd / roundtrip_check.cmd`
  - PowerShell 入口：`json2xbs.ps1 / xbs2json.ps1 / roundtrip_check.ps1`
  - 首次验证顺序：`doctor -> json2xbs -> xbs2json -> roundtrip`
  - `doctor` 期望：`resolved_runner_source=builtin_windows_bin`（或 `env_bin`）
- 需要定位“保存闪退”字段时，生成 A/B 变体：
  - `python tools/scripts/xbs_tool.py build-ab -i <input.json> -d <out_dir> --prefix <name> --to-xbs`
- 需要批量修复历史书源时：
  - `python tools/scripts/xbs_tool.py normalize-2561 -i <json_or_dir> --rebuild-xbs --report <report.json>`
- 兼容保留：`json2xbs.sh / xbs2json.sh / roundtrip_check.sh`（内部已转调 `xbs_tool.py`）。
- 至少验证：`searchBook`、`bookDetail`、`chapterList`、`chapterContent`。
- 补充验证（必须）：
  - 编辑保存稳定性（新增硬门槛）：
    - 导入后进入编辑页，不改直接保存
    - 修改 1 个字符后保存
    - 修改 1 个规则字段后保存
    - 三项均不得闪退
  - `searchBook`：模糊词（列表页）与精确词（直达详情页）各测 1 次。
  - `bookWorld`：分类第 1 页与第 2 页各测 1 次，确认没有超时/卡死。
  - `bookWorld`：若第 2 页不存在，需明确记录“分类单页策略”并将 `maxPage` 下调到 1。
  - `searchBook/bookWorld`：检查是否出现“整行文本污染”（字段含大量换行、连续空白、跨列拼接）；若命中，收窄 XPath 并统一 `trim`。
  - `chapterContent`：至少测 2 章，确认正文为完整内容，不是“加载中/分页片段/防爬提示行”。
  - `chapterContent`：若 `code=0` 但正文命中占位文案（如“网络开小差了，请稍后再试”），按上游异常处理，不判为解析规则成功。
  - `chapterContent`：若接口返回 `status=1` 但正文空，优先排查：
    - 是否命中 `chapterToken` 等早退分支导致误返回空
    - 是否出现“脚本 + JSON”混合响应而解析逻辑只处理单一形态
  - `chapterContent`：若提示“网络错误”，优先排查响应体是否含：
    - `仅支持网页端访问`
    - `不支持该客户端访问`
    并回查二跳请求头是否正确。
  - 导入稳定性：目标客户端导入后不得闪退；若闪退，先排查是否引入超长混淆 WAF JS 主链路。
  - 加密正文：若返回含 `encrypt=1`，必须验证最终正文“非空且非密文串”。
  - 分类覆盖：交付前确认 `bookWorld` 与 `requestFilters` 已配置（若站点受限需记录降级方案）。
  - 交付备注：必须在 `delivery_notes` 或发布说明写入 `公众号:好用的软件站`。

## 3. 发布阶段
- 文件落地到 `sources/final/<site>/`：
  - `<name>.json`
  - `<name>.xbs`
  - `<name>.roundtrip.json`
- 发布前检查（必须）：
  - 客户端导入稳定（不闪退）
  - 编辑页保存稳定（不改保存 / 改名保存 / 改字段保存）
  - 正文解密可用（非空、非密文）
  - 分类能力完整（`bookWorld/requestFilters`）
  - 交付备注包含：`公众号:好用的软件站`
- 更新 `docs/CHANGELOG.md`。
- 更新 `records/checksums/final_sources.sha256`。

## 3.1 内置 Windows EXE 更新流程（运维契约）
- 上游来源：`xbsrebuild` 仓库的 Windows amd64 构建产物（`xbsrebuild.exe` + `sha256`）。
- 同步步骤：
  - 将 `xbsrebuild.exe` 放入 `tools/bin/windows/`
  - 更新 `tools/bin/windows/xbsrebuild.metadata.json`（包含 `source_commit` 与 `sha256`）
  - 在 `doctor` 中确认可识别并命中内置二进制
- 发布前校验：
  - 校验 `metadata.sha256` 与文件实际 SHA256 一致
  - 跑一轮 `json2xbs/xbs2json/roundtrip` 基础回归

## 3.2 内置 vendored 源码同步流程（运维契约）
- vendored 路径：`tools/vendor/xbsrebuild/`
- 上游仓库：`https://github.com/ne1llee/xbsrebuild`
- 同步方式：源码快照（不保留 `.git` 历史）
- 同步步骤：
  - 从上游基线 commit 导出源码，排除 `.git/` 与构建产物缓存
  - 覆盖更新 `tools/vendor/xbsrebuild/`
  - 更新 `tools/vendor/xbsrebuild/UPSTREAM_SOURCE.md`（仓库地址、同步 commit、同步日期）
  - 执行 `python tools/scripts/xbs_tool.py doctor`，确认 `vendored_xbsrebuild_root_exists: True`
- 运行时探测顺序（固定）：
  1. `XBSREBUILD_BIN`
  2. `tools/bin/windows/xbsrebuild.exe`
  3. PATH `xbsrebuild`
  4. `XBSREBUILD_ROOT`
  5. 同级 `../xbsrebuild`
  6. `tools/vendor/xbsrebuild`

## 4. 复盘阶段
- 将问题与结论写入 `docs/RETROSPECT_LOG.md`。
- 更新 skill 文档与通用规则文档。
- 若问题涉及编码、分页策略或上下文解析优先级，必须同步到：
- 若问题涉及 API-first 站点、目录哨兵章节或占位正文识别，必须同步到：
  - `docs/香色书源开发指南与工作流程.md`
  - `docs/XBS_JSON_CODING_RULES.md`
