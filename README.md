# xiangseSkill

香色闺阁书源开发资料仓库，聚焦三件事：
- 书源格式转换（JSON <-> XBS）
- Codex 技能（skill）沉淀
- 实战规则文档维护

## 视频与社群

- B站视频：
  [别再手写书源了！用ChatGPT Codex 全自动转换开源阅读书源（成功率90%）](https://www.bilibili.com/video/BV14JPrzxEd2/?share_source=copy_web&vd_source=13e2e41429e96311a744cc03ef2e7861)
- 公众号：好用的软件站

公众号二维码：

![公众号二维码](assets/wechat-official-account-qr.jpg)

- 微信群：香色闺阁自动写源群（扫码入群，二维码以最新版本为准，过期请联系更新）

微信群二维码：

![微信群二维码](assets/wechat-group-qr.jpg)

## 目录说明

- `tools/scripts/`: 转换脚本
  - `json2xbs.sh`
  - `xbs2json.sh`
  - `roundtrip_check.sh`
- `skills/global/`: 通用技能
  - `xbs-booksource-workflow.SKILL.md`
- `skills/local/`: 项目约束技能
  - `xiangse-booksource.SKILL.md`
- `docs/`: 规则文档与维护记录

## 环境要求

- macOS / Linux
- Go 1.22+
- 本地可运行 `xbsrebuild` 工具

默认脚本会读取环境变量 `XBSREBUILD_ROOT`，未设置时回退到：
`/Users/mantou/Documents/idea/3.2/xbsrebuild`

建议显式设置：

```bash
export XBSREBUILD_ROOT=/path/to/xbsrebuild
```

## 书源转换用法

### 1) JSON -> XBS

```bash
bash tools/scripts/json2xbs.sh <input.json> <output.xbs>
```

### 2) XBS -> JSON

```bash
bash tools/scripts/xbs2json.sh <input.xbs> <output.json>
```

### 3) 回转校验（推荐）

```bash
bash tools/scripts/roundtrip_check.sh <input.json> <output_prefix>
```

会生成：
- `<output_prefix>.xbs`
- `<output_prefix>.roundtrip.json`

## 如何正确使用我们的 skill

### 在 Codex 中触发

1. 安装/放置 skill 文件（到你的 Codex skills 目录）。
2. 在对话中明确点名 skill：

```text
请使用 $xbs-booksource-workflow 为 https://example.com 写香色闺阁书源。
```

如果需要项目内约束一起执行：

```text
请同时按 $xbs-booksource-workflow 和本仓库 local 规则实现并验证。
```

### 推荐工作流

1. 先抓站点四类页面样本：搜索、详情、目录、正文。
2. 先产出 JSON 规则，再执行 `roundtrip_check.sh`。
3. 用文档规则复核：
   - `docs/XBS_JSON_CODING_RULES.md`
   - `docs/MAINTENANCE_WORKFLOW.md`
4. 最后导出可导入的 XBS，并记录变更到 `docs/CHANGELOG.md`。

## 参考文档

- `docs/香色书源开发指南与工作流程.md`
- `docs/XBS_JSON_CODING_RULES.md`
- `docs/RETROSPECT_LOG.md`
