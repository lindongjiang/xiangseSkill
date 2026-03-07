# 香色书源实战 Skill

## 触发场景
- 维护香色闺阁书源（JSON/XBS）
- 章节列表能出标题但抓不到 `url/detailUrl`
- 书源命名与发布规范统一
- 需要把任务交给弱模型（如 Tare）执行

## 固定规则
1. 书源名称必须以 `(公众号:好用的软件站)` 结尾。
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
9. 转换命令统一优先给跨平台入口：
   - `python tools/scripts/xbs_tool.py json2xbs -i <json> -o <xbs>`
   - `python tools/scripts/xbs_tool.py xbs2json -i <xbs> -o <json>`
   - `python tools/scripts/xbs_tool.py roundtrip -i <json> -p <prefix>`
   - 仅在用户明确是 macOS/Linux/bash 时，再给 `.sh` 版本命令。

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
- 名称后缀一致
- 章节列表返回包含 `title + url + detailUrl`
- 对 Windows/Termux 用户补充可直接运行命令，不要求用户手改脚本路径。

## 弱模型（Tare）执行模式
1. 强制引用：`docs/TARE_USAGE_PLAYBOOK.md`
2. 强制单任务：`new_source / fix_source / convert_only` 三选一
3. 强制固定输出：仅允许返回手册中的 JSON 结构
4. 强制命令化交付：必须给可复制命令，不给“建议型段落”
5. 强制失败显式化：输入不足时只能返回 `status=need_input` + `missing[]`
