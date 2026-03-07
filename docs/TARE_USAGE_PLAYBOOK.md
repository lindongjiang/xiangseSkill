# Tare 使用手册（弱模型友好）

目标：让能力较弱的模型也能稳定使用本仓库的规则与 skill。  
原则：少思考、少分支、强约束、固定格式。

## 1. 执行总规则

1. 一次只做一个任务（新建书源 / 修复规则 / 转换文件 三选一）。
2. 每次输入必须给“完整输入包”，不允许让模型自行猜。
3. 输出必须是固定 JSON 结构，不允许自由散文。
4. 先出可运行结果，再做解释。
5. 命令全部可复制执行（Windows 给 PowerShell/CMD，移动端给 Termux）。
6. 先做 schema 体检，再做转换；体检不通过禁止进入 `json2xbs`。

## 2. 输入包模板（必须给全）

每次提问至少包含：

- `task_type`：`new_source` / `fix_source` / `convert_only`
- `site`：站点根 URL（可为空，仅 convert 任务）
- `input_file`：输入文件绝对路径（若有）
- `target_file`：输出文件绝对路径（若有）
- `must_rules`：必须遵守的规则（例如“list 子字段一律 // 开头”）
- `samples`：最少 1 份样本（HTML/JSON/报错文本）

示例（可直接复制）：

```text
task_type=fix_source
site=https://m.libahao.com/
input_file=/abs/path/libahao_source.json
target_file=/abs/path/libahao_source_fixed.json
must_rules=1) list 子字段 XPath 必须 // 开头 2) 去除空白污染 3) 分类 cover 不能为空
samples=已附分类页 HTML 与错误解析 JSON
```

## 3. 提问模板（可直接复制）

### A) 新建书源

```text
请按仓库 docs/TARE_USAGE_PLAYBOOK.md 执行。
task_type=new_source
site=<站点URL>
must_rules=1) XPath 子字段 // 开头 2) 输出 JSON+XBS 路径 3) 给 roundtrip 命令
samples=<粘贴搜索/详情/目录/正文样本>
输出必须使用“固定输出格式”。
```

### B) 修复书源

```text
请按仓库 docs/TARE_USAGE_PLAYBOOK.md 执行。
task_type=fix_source
site=<站点URL>
input_file=<绝对路径>
target_file=<绝对路径>
must_rules=<你的硬规则>
samples=<粘贴错误响应>
输出必须使用“固定输出格式”。
```

### C) 仅做转换

```text
请按仓库 docs/TARE_USAGE_PLAYBOOK.md 执行。
task_type=convert_only
input_file=<绝对路径 input.json 或 input.xbs>
target_file=<绝对路径 output>
must_rules=使用 xbs_tool.py，给出可复制命令
输出必须使用“固定输出格式”。
```

## 4. 固定输出格式（必须）

必须输出以下 JSON（字段不能缺）：

```json
{
  "status": "ok",
  "task_type": "fix_source",
  "inputs_used": {
    "site": "https://m.libahao.com/",
    "input_file": "/abs/in.json",
    "target_file": "/abs/out.json"
  },
  "edits": [
    {
      "file": "/abs/path/file",
      "change": "做了什么修改（1 句话）"
    }
  ],
  "commands": [
    "python tools/scripts/check_xiangse_schema.py /abs/in.json",
    "python tools/scripts/xbs_tool.py doctor",
    "python tools/scripts/xbs_tool.py json2xbs -i /abs/in.json -o /abs/out.xbs",
    "python tools/scripts/xbs_tool.py roundtrip -i /abs/in.json -p /abs/verify/out"
  ],
  "self_check": [
    "listLengthOnlyDebug > 0 且关键字段非空",
    "字段无多余换行/连续空白",
    "分类 cover 可返回"
  ],
  "need_user_confirm": [],
  "schema_check": "PASS",
  "schema_errors": [],
  "next_action": "可直接执行 commands"
}
```

输出里必须包含：
- `schema_check`: `PASS` 或 `FAIL`
- 若 `FAIL`，必须给 `schema_errors[]`，且 `next_action` 只能是“先修 schema”

## 5. 禁止项（弱模型必须禁）

1. 禁止一次处理多个站点。
2. 禁止在未给样本时自行脑补 XPath。
3. 禁止输出“可能/大概/建议你再试试”式结论，不给可执行命令。
4. 禁止跳过 roundtrip 验证。
5. 禁止把 `./...` 作为 list 子字段 XPath。
6. 禁止输出非香色字段：
   - `bookSourceName/bookSourceUrl/bookSourceGroup/httpUserAgent`
7. 禁止在 `requestInfo` 使用：
   - `java.getParams()`
   - `method:`、`data:`、`headers:`

## 6. 失败兜底模板

当输入不足时，仅允许输出：

```json
{
  "status": "need_input",
  "missing": [
    "task_type",
    "samples"
  ],
  "required_example": "请补一段搜索结果 HTML 或解析失败 JSON。"
}
```
