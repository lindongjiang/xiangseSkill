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
  - `xbs_tool.py`（跨平台主入口，推荐）
  - `json2xbs.sh`
  - `xbs2json.sh`
  - `roundtrip_check.sh`
  - `json2xbs.cmd`（Windows）
  - `xbs2json.cmd`（Windows）
  - `roundtrip_check.cmd`（Windows）
- `skills/global/`: 通用技能
  - `xbs-booksource-workflow.SKILL.md`
- `skills/local/`: 项目约束技能
  - `xiangse-booksource.SKILL.md`
- `docs/`: 规则文档与维护记录

## 环境要求

- Python 3.9+
- Go 1.22+（当你没有预编译 `xbsrebuild` 可执行文件时需要）
- `xbsrebuild` 工具满足任意一种即可：
  - `xbsrebuild` 已加入 `PATH`
  - 设置 `XBSREBUILD_BIN` 指向可执行文件（Windows 可指向 `.exe`）
  - 设置 `XBSREBUILD_ROOT` 指向 `xbsrebuild` 源码目录（脚本会自动 `go run`）

默认会按以下顺序自动探测：
1. `XBSREBUILD_BIN`
2. `PATH` 中的 `xbsrebuild`
3. `XBSREBUILD_ROOT`
4. 仓库同级目录 `../xbsrebuild`

建议显式设置：

```bash
export XBSREBUILD_ROOT=/path/to/xbsrebuild
```

Windows PowerShell 建议：

```powershell
$env:XBSREBUILD_BIN="D:\tools\xbsrebuild.exe"
```

## 书源转换用法

### 推荐（跨平台统一命令）

```bash
python tools/scripts/check_xiangse_schema.py <input.json>
python tools/scripts/xbs_tool.py doctor
python tools/scripts/xbs_tool.py json2xbs -i <input.json> -o <output.xbs>
python tools/scripts/xbs_tool.py xbs2json -i <input.xbs> -o <output.json>
python tools/scripts/xbs_tool.py roundtrip -i <input.json> -p <output_prefix>
```

说明：
- `xbs_tool.py` 在 `json2xbs/roundtrip` 会自动执行 schema 检查并在失败时中断。
- 仅在你明确要跳过时使用：`--skip-schema-check`。

### macOS / Linux / Termux（兼容旧命令）

#### 1) JSON -> XBS

```bash
bash tools/scripts/json2xbs.sh <input.json> <output.xbs>
```

#### 2) XBS -> JSON

```bash
bash tools/scripts/xbs2json.sh <input.xbs> <output.json>
```

#### 3) 回转校验（推荐）

```bash
bash tools/scripts/roundtrip_check.sh <input.json> <output_prefix>
```

会生成：
- `<output_prefix>.xbs`
- `<output_prefix>.roundtrip.json`

### Windows（CMD）

```bat
tools\scripts\json2xbs.cmd <input.json> <output.xbs>
tools\scripts\xbs2json.cmd <input.xbs> <output.json>
tools\scripts\roundtrip_check.cmd <input.json> <output_prefix>
```

### Windows（PowerShell）

```powershell
python .\tools\scripts\xbs_tool.py doctor
python .\tools\scripts\xbs_tool.py json2xbs -i .\in.json -o .\out.xbs
```

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

给普通用户的建议话术（可直接复制）：

```text
请使用 $xbs-booksource-workflow，按 Windows/Termux 兼容流程输出：
1) 先给 JSON 规则
2) 再给 xbs_tool.py 转换命令
3) 最后给 roundtrip 校验命令和失败排查点
```

## Tare（弱模型）专用用法

如果使用 Tare 这类弱模型，不要直接让它“自由发挥”，请强制走固定协议：

1. 先让它读取：`docs/TARE_USAGE_PLAYBOOK.md`
2. 每次只给一个任务类型：`new_source / fix_source / convert_only`
3. 要求它只按“固定输出 JSON”返回结果
4. 强制先跑：`python tools/scripts/check_xiangse_schema.py <json>`

可复制提问模板：

```text
请严格按 /docs/TARE_USAGE_PLAYBOOK.md 执行。
task_type=fix_source
site=https://m.libahao.com/
input_file=/abs/path/libahao_source.json
target_file=/abs/path/libahao_source_fixed.json
must_rules=1) list 子字段 XPath 必须 // 开头 2) 去除空白污染 3) 分类 cover 不能为空
samples=（粘贴你的错误解析 JSON）
只允许输出固定 JSON，不要输出自由文本。
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
- `docs/TARE_USAGE_PLAYBOOK.md`
