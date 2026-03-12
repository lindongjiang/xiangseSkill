# 香色书源实战 Skill

## 触发场景
- 维护香色闺阁书源（JSON/XBS）
- 章节列表能出标题但抓不到 `url/detailUrl`
- 书源命名与发布规范统一
- 需要把任务交给弱模型（如 Tare）执行
- 当前约束版本：仅香色闺阁（StandarReader）`2.56.1`

## 固定规则
1. `sourceName` 保持站点名与版本号语义，不追加公众号后缀。
   - 公众号信息统一写在交付备注区（`delivery_notes`）：`公众号:好用的软件站`。
2. `chapterList` 里即使 `list` 已经相对定位到章节节点（例如已到 `<a>`），`title/url/detailUrl` 也默认使用双斜杠写法：
   - `title: //text()`
   - `url: //@href`
   - `detailUrl: //@href`
3. 遇到“标题能出、链接为空”时，优先把 `text()` 改 `//text()`，把 `@href` 改 `//@href`。
4. 上述场景不要默认叠加 `//a/@href[1]` 与 `||@js`，除非已确认客户端无法补全相对链接。
5. 先保证“能取到链接”，再考虑“绝对化链接”。
6. `chapterContent.nextPageUrl` 必须做“同章分页守卫”：
   - 先取候选“右侧翻页位”（如 `prenext` 里的第二个 `span/a`）。
   - 仅当候选 URL 与当前 URL 的 `{bookId, chapterId}` 一致，且分页号严格递增时返回；
   - 命中“下一章/目录/详情”一律返回空。
7. 站点搜索若被外部域接管且结果链接加密（如 `toUrl/openUrl`）：
   - 不要默认接入外部加密链路做主搜索；
   - 优先用“分类页遍历 + 关键词过滤”做可用降级。
8. 目录接口若为 `index.php?action=loadChapterPage` 且按页返回章节：
   - 需防“越界页重复最后一页/短书重复第 1 页”；
   - `nextPageUrl` 不能仅按 `list.length > 0` 决定，需叠加 `chapterorder` 页范围校验（如每页 `1-100`、`101-200`）。
9. 17K 类加密正文站点必须做解密验收：
   - 当响应存在 `content[].encrypt=1` 时，禁止把“`title` 有值但 `content` 为空”判定为成功。
   - 需要明确记录“解密前片段/解密后片段”至少各 1 条样例。
10. 转换命令统一优先给跨平台入口：
   - `python tools/scripts/xbs_tool.py json2xbs -i <json> -o <xbs>`
   - `python tools/scripts/xbs_tool.py xbs2json -i <xbs> -o <json>`
   - `python tools/scripts/xbs_tool.py roundtrip -i <json> -p <prefix>`
   - 仅在用户明确是 macOS/Linux/bash 时，再给 `.sh` 版本命令。
   - Windows 默认无需 Go：优先使用仓库内置 `tools/bin/windows/xbsrebuild.exe`。
   - 默认不依赖外部同级 `../xbsrebuild` 仓库；缺失时自动回退到仓内 `tools/vendor/xbsrebuild`。
   - Windows 可选入口：
     - CMD：`json2xbs.cmd / xbs2json.cmd / roundtrip_check.cmd`
     - PowerShell：`json2xbs.ps1 / xbs2json.ps1 / roundtrip_check.ps1`
11. 转换前必须先过 schema 体检（硬门槛）：
   - `python tools/scripts/check_xiangse_schema.py <json>`
   - 若失败，先修 JSON 结构，再做 json2xbs。
   - `xbs_tool.py` 已默认内置此检查；失败会直接中断转换。
12. 严禁混入非香色 schema 字段与运行时：
   - 禁用：`bookSourceName/bookSourceUrl/bookSourceGroup/httpUserAgent`
   - 禁用：`java.getParams()`、`method:`、`data:`、`headers:`
   - 使用：`sourceName/sourceUrl/sourceType` + `config/params/result` + `POST/httpParams/httpHeaders`
13. `sourceType` 必须为 `"text"`（硬约束），不再接受 `0/text` 混用。
14. 遇到旧源导入失败时先走导入修复流水线：
   - `python tools/scripts/xbs_tool.py import-fix -i <input.xbs|input.json> -o <fixed.json> --to-xbs <fixed.xbs> --report <fix_report.json>`
   - 再执行：`check_xiangse_schema.py -> check-editor -> simulate-live -> json2xbs`
15. StandarReader 2.56.1 若出现“编辑保存闪退”，切换 `editor_safe` 兼容模式：
   - `python tools/scripts/xbs_tool.py check-editor -i <json>`
   - `python tools/scripts/xbs_tool.py profile -i <json> -o <editor_safe.json> --profile editor_safe`
   - `python tools/scripts/xbs_tool.py build-ab -i <json> -d <out_dir> --prefix <name> --to-xbs`
   - 若日志出现 `-[__NSCFNumber length]`，先检查 `weight` 是否被写成数字类型。
16. `weight` 必须使用整数字符串（例如 `"9999"`），默认 `"9999"`，禁止数字类型。
17. 需要批量修复历史书源时使用：
   - `python tools/scripts/xbs_tool.py normalize-2561 -i <json_or_dir> --rebuild-xbs --report <report.json>`
18. `editor_safe` 仅做字段降级，不改变香色顶层结构（仍保持 `{alias:{sourceName...}}`）。
19. 交付前必须跑真实模拟四步链路（不导入 App）：
   - `python tools/scripts/xbs_tool.py simulate-live -i <input.xbs|input.json> --keyword 都市 --book-index 0 --chapter-index 0 --report <simulate_report.json>`
   - `simulation_verdict` 必须为 `pass`；若是 `blocked`，按风控阻断处理，不得误判为 parser 成功。

## 推荐模板
```json
"chapterList": {
  "list": "//div[@id='chapter-list']/a",
  "title": "//text()",
  "url": "//@href",
  "detailUrl": "//@href"
}
```

## 调试清单
1. `listLengthOnlyDebug > 0` 但 `url` 为空：先把 `url/detailUrl` 改成 `//@href`。
2. `title` 正常、`url` 为空：把 `title` 从 `text()` 改为 `//text()` 再测。
3. `title` 正常、`url` 仍为空：检查是否误用全局 XPath（如 `//a/@href[1]`）。
4. `nextPageUrl` 有值但翻页失败：先确认该值是否相对于当前分页页面而非章节页面。
5. `nextPageUrl` 命中“下一章”导致跨章串文：给 `chapterContent.nextPageUrl` 增加“同章分页守卫”。
6. 分类第 2 页抓不到：先确认站点分页是 `/cat/2.html` 还是 `/cat/p-2.html`，不要猜路径。

## 交付检查
- JSON 与 XBS 同步更新
- 交付备注包含：`公众号:好用的软件站`
- 编辑保存稳定性（2.56.1）：
  - 不改保存不闪退
  - 改名保存不闪退
  - 改 1 个规则字段后保存不闪退
- 模拟测试稳定性（导入前）：
  - `simulate-live` 四步均 pass
  - 若 blocked，备注中必须写明阻断原因（如 `403/challenge`）
- 章节列表返回包含 `title + url + detailUrl`
- 若章节返回加密正文（如 `encrypt=1`），必须给出“解密成功且正文非空”的验证结论
- 分类功能不可缺失：`bookWorld` 与 `requestFilters` 两者都应提供；若站点限制无法提供，需在 `delivery_notes` 说明原因与降级策略
- 对 Windows/Termux 用户补充可直接运行命令，不要求用户手改脚本路径。
- Windows 首次排障先执行：
  - `python tools/scripts/xbs_tool.py doctor`
  - 需看到 `resolved_runner_source: builtin_windows_bin`（或显式 `XBSREBUILD_BIN`）。

## 弱模型（Tare）执行模式
1. 强制引用：`docs/TARE_USAGE_PLAYBOOK.md`
2. 强制单任务：`new_source / fix_source / convert_only` 三选一
3. 强制固定输出：仅允许返回手册中的 JSON 结构
4. 强制命令化交付：必须给可复制命令，不给“建议型段落”
5. 强制失败显式化：输入不足时只能返回 `status=need_input` + `missing[]`
6. 强制 schema 先行：返回结果里必须包含 `check_xiangse_schema.py` 的执行结论。
