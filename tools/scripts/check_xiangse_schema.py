#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


REQUIRED_TOP_FIELDS = [
    "sourceName",
    "sourceUrl",
    "sourceType",
    "enable",
    "weight",
]

ACTION_KEYS = ["searchBook", "bookDetail", "chapterList", "chapterContent"]
REQUIRED_ACTION_FIELDS = ["actionID", "parserID", "requestInfo", "responseFormatType"]

FORBIDDEN_TOP_KEYS = {
    "bookSourceName",
    "bookSourceUrl",
    "bookSourceGroup",
    "httpUserAgent",
}

BAD_REQUESTINFO_PATTERNS = [
    (re.compile(r"\bjava\.getParams\s*\(", re.I), "requestInfo 使用了 java.getParams()（非香色运行时）"),
    (re.compile(r"\bmethod\s*:", re.I), "requestInfo 使用 method: 键，香色应使用 POST"),
    (re.compile(r"\bdata\s*:", re.I), "requestInfo 使用 data: 键，香色应使用 httpParams"),
    (re.compile(r"\bheaders\s*:", re.I), "requestInfo 使用 headers: 键，香色应使用 httpHeaders"),
]


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _iter_sources(doc: Any) -> list[tuple[str, dict[str, Any]]]:
    if not isinstance(doc, dict):
        return []
    top_keys = set(doc.keys())
    if (
        top_keys.intersection(REQUIRED_TOP_FIELDS)
        or top_keys.intersection(FORBIDDEN_TOP_KEYS)
        or top_keys.intersection(ACTION_KEYS)
    ):
        # A single source object without alias wrapper.
        return [("<root>", doc)]

    pairs: list[tuple[str, dict[str, Any]]] = []
    for k, v in doc.items():
        if not isinstance(v, dict):
            continue
        vk = set(v.keys())
        if (
            vk.intersection(REQUIRED_TOP_FIELDS)
            or vk.intersection(FORBIDDEN_TOP_KEYS)
            or vk.intersection(ACTION_KEYS)
        ):
            pairs.append((k, v))
    return pairs


def _check_one_source(name: str, src: dict[str, Any], errors: list[str], warnings: list[str]) -> None:
    for bad in FORBIDDEN_TOP_KEYS:
        if bad in src:
            errors.append(f"[{name}] 命中非香色顶层字段: {bad}")

    for req in REQUIRED_TOP_FIELDS:
        if req not in src:
            errors.append(f"[{name}] 缺少顶层必需字段: {req}")

    st = src.get("sourceType")
    if st is not None and st != "text":
        warnings.append(f"[{name}] sourceType={st}（当前流程默认 text 书源）")

    for action in ACTION_KEYS:
        obj = src.get(action)
        if obj is None:
            errors.append(f"[{name}] 缺少动作: {action}")
            continue
        if not isinstance(obj, dict):
            errors.append(f"[{name}] 动作 {action} 不是对象")
            continue
        for req in REQUIRED_ACTION_FIELDS:
            if req not in obj:
                errors.append(f"[{name}] 动作 {action} 缺少字段: {req}")

        req_info = obj.get("requestInfo")
        if isinstance(req_info, str):
            for pat, msg in BAD_REQUESTINFO_PATTERNS:
                if pat.search(req_info):
                    errors.append(f"[{name}] 动作 {action}: {msg}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Check whether a source JSON matches xiangse schema.")
    parser.add_argument("input", help="Path to source JSON")
    args = parser.parse_args()

    path = Path(args.input).expanduser().resolve()
    if not path.exists():
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        return 2

    try:
        doc = _load_json(path)
    except Exception as exc:
        print(f"ERROR: invalid JSON: {exc}", file=sys.stderr)
        return 2

    errors: list[str] = []
    warnings: list[str] = []
    sources = _iter_sources(doc)
    if not sources:
        errors.append("顶层必须是对象，且至少包含一个 sourceName->sourceConfig 映射。")
    else:
        for name, src in sources:
            _check_one_source(name, src, errors, warnings)

    if warnings:
        print("WARNINGS:")
        for w in warnings:
            print(f"- {w}")

    if errors:
        print("SCHEMA_CHECK: FAIL")
        for e in errors:
            print(f"- {e}")
        return 1

    print("SCHEMA_CHECK: PASS")
    print(f"SOURCE_COUNT: {len(sources)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
