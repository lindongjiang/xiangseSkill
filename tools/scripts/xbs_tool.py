#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

from editor_compat import (
    CORE_ACTIONS,
    build_ab_variants,
    load_json,
    normalize_source_for_2561,
    pick_source,
    save_json,
    to_editor_safe_profile,
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _vendored_xbsrebuild_root(repo_root: Path) -> Path:
    return repo_root / "tools" / "vendor" / "xbsrebuild"


def _is_windows() -> bool:
    return os.name == "nt" or platform.system().lower().startswith("win")


def _builtin_windows_bin(repo_root: Path) -> Path:
    return repo_root / "tools" / "bin" / "windows" / "xbsrebuild.exe"


def _resolve_runner(repo_root: Path) -> tuple[list[str], Path | None, str]:
    # 1) explicit binary path from env
    env_bin = os.environ.get("XBSREBUILD_BIN", "").strip()
    if env_bin:
        bin_path = Path(env_bin).expanduser().resolve()
        if not bin_path.exists():
            raise FileNotFoundError(f"XBSREBUILD_BIN not found: {bin_path}")
        return [str(bin_path)], None, "env_bin"

    # 2) built-in windows binary
    if _is_windows():
        builtin_bin = _builtin_windows_bin(repo_root)
        if builtin_bin.exists():
            return [str(builtin_bin)], None, "builtin_windows_bin"

    # 3) xbsrebuild in PATH
    path_bin = shutil.which("xbsrebuild")
    if path_bin:
        return [path_bin], None, "path_bin"

    # 4) go run via XBSREBUILD_ROOT
    xbsrebuild_root = os.environ.get("XBSREBUILD_ROOT", "").strip()
    if xbsrebuild_root:
        root = Path(xbsrebuild_root).expanduser().resolve()
        if root.exists():
            if not shutil.which("go"):
                raise RuntimeError(
                    "go command not found. Install Go or set XBSREBUILD_BIN / built-in xbsrebuild.exe."
                )
            return ["go", "run", "."], root, "xbsrebuild_root_env"

    # 5) sibling external repo fallback
    sibling_root = (repo_root.parent / "xbsrebuild").resolve()
    if sibling_root.exists():
        if not shutil.which("go"):
            raise RuntimeError(
                "go command not found. Install Go or set XBSREBUILD_BIN / built-in xbsrebuild.exe."
            )
        return ["go", "run", "."], sibling_root, "sibling_root"

    # 6) vendored source fallback
    vendored_root = _vendored_xbsrebuild_root(repo_root).resolve()
    if vendored_root.exists():
        if not shutil.which("go"):
            raise RuntimeError(
                "go command not found. Install Go or set XBSREBUILD_BIN / built-in xbsrebuild.exe."
            )
        return ["go", "run", "."], vendored_root, "vendored_root"

    raise FileNotFoundError(
        "Cannot find xbsrebuild. Set XBSREBUILD_BIN, use built-in tools/bin/windows/xbsrebuild.exe (Windows), "
        "or provide Go runtime with XBSREBUILD_ROOT/sibling/vendored source."
    )


def _run_xbsrebuild(action: str, input_path: Path, output_path: Path) -> None:
    repo_root = _repo_root()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd_prefix, cwd, _ = _resolve_runner(repo_root)
    cmd = cmd_prefix + [action, "-i", str(input_path), "-o", str(output_path)]

    env = os.environ.copy()
    cache_root = repo_root / ".cache"
    gocache = cache_root / "gocache"
    gomodcache = cache_root / "gomodcache"
    gocache.mkdir(parents=True, exist_ok=True)
    gomodcache.mkdir(parents=True, exist_ok=True)

    env.setdefault("GOPROXY", "https://goproxy.cn,direct")
    env.setdefault("GOSUMDB", "sum.golang.google.cn")
    env["GOCACHE"] = str(gocache)
    env["GOMODCACHE"] = str(gomodcache)

    completed = subprocess.run(cmd, cwd=str(cwd) if cwd else None, env=env)
    if completed.returncode != 0:
        raise RuntimeError(f"xbsrebuild command failed: {' '.join(cmd)}")


def _run_schema_check(input_json: Path, *, strict_requestinfo: bool = False) -> None:
    checker = Path(__file__).resolve().parent / "check_xiangse_schema.py"
    if not checker.exists():
        raise FileNotFoundError(f"schema checker not found: {checker}")
    cmd = [sys.executable, str(checker), str(input_json)]
    if strict_requestinfo:
        cmd.append("--strict-requestinfo")
    completed = subprocess.run(cmd)
    if completed.returncode != 0:
        raise RuntimeError(
            "xiangse schema check failed. Fix JSON first, or use --skip-schema-check if you really need to bypass."
        )


def _run_editor_check(input_json: Path, *, strict: bool) -> None:
    checker = Path(__file__).resolve().parent / "check_editor_compat.py"
    if not checker.exists():
        raise FileNotFoundError(f"editor compat checker not found: {checker}")
    cmd = [sys.executable, str(checker), str(input_json)]
    if strict:
        cmd.append("--strict")
    completed = subprocess.run(cmd)
    if completed.returncode != 0:
        raise RuntimeError(
            "editor compatibility check failed. Use profile editor_safe or A/B variants for triage."
        )


def _command_json2xbs(args: argparse.Namespace) -> None:
    input_json = Path(args.input).resolve()
    if not args.skip_schema_check:
        _run_schema_check(input_json, strict_requestinfo=args.strict_requestinfo)
    _run_xbsrebuild("json2xbs", input_json, Path(args.output).resolve())
    print(f"OK: {Path(args.output).resolve()}")


def _command_xbs2json(args: argparse.Namespace) -> None:
    _run_xbsrebuild("xbs2json", Path(args.input).resolve(), Path(args.output).resolve())
    print(f"OK: {Path(args.output).resolve()}")


def _command_roundtrip(args: argparse.Namespace) -> None:
    input_json = Path(args.input).resolve()
    prefix = Path(args.prefix).resolve()
    xbs_path = prefix.with_suffix(".xbs")
    roundtrip_json = prefix.with_suffix(".roundtrip.json")

    if not args.skip_schema_check:
        _run_schema_check(input_json, strict_requestinfo=args.strict_requestinfo)

    _run_xbsrebuild("json2xbs", input_json, xbs_path)
    _run_xbsrebuild("xbs2json", xbs_path, roundtrip_json)

    print("Roundtrip done:")
    print(f"- {xbs_path}")
    print(f"- {roundtrip_json}")


def _command_doctor(_: argparse.Namespace) -> None:
    repo_root = _repo_root()
    builtin_bin = _builtin_windows_bin(repo_root)
    builtin_meta = repo_root / "tools" / "bin" / "windows" / "xbsrebuild.metadata.json"
    vendored_root = _vendored_xbsrebuild_root(repo_root)
    sibling_root = repo_root.parent / "xbsrebuild"
    print(f"repo_root: {repo_root}")
    print(f"python: {sys.executable}")
    print(f"platform: {platform.platform()}")
    print(f"is_windows: {_is_windows()}")
    print(f"go_in_path: {shutil.which('go') or ''}")
    print(f"xbsrebuild_in_path: {shutil.which('xbsrebuild') or ''}")
    print(f"XBSREBUILD_BIN: {os.environ.get('XBSREBUILD_BIN', '')}")
    print(f"XBSREBUILD_ROOT: {os.environ.get('XBSREBUILD_ROOT', '')}")
    print(f"builtin_windows_bin: {builtin_bin}")
    print(f"builtin_windows_bin_exists: {builtin_bin.exists()}")
    print(f"builtin_windows_metadata: {builtin_meta}")
    print(f"builtin_windows_metadata_exists: {builtin_meta.exists()}")
    print(f"sibling_xbsrebuild_root: {sibling_root}")
    print(f"sibling_xbsrebuild_root_exists: {sibling_root.exists()}")
    print(f"vendored_xbsrebuild_root: {vendored_root}")
    print(f"vendored_xbsrebuild_root_exists: {vendored_root.exists()}")
    if builtin_meta.exists():
        try:
            data = json.loads(builtin_meta.read_text(encoding="utf-8"))
            print(f"builtin_windows_metadata_commit: {data.get('source_commit_short') or data.get('source_commit') or ''}")
            print(f"builtin_windows_metadata_sha256: {data.get('sha256') or ''}")
        except Exception as exc:
            print(f"builtin_windows_metadata_error: {exc}")
    try:
        cmd, cwd, source = _resolve_runner(repo_root)
        print(f"resolved_runner_source: {source}")
        print(f"resolved_runner: {' '.join(cmd)}")
        print(f"resolved_cwd: {cwd or ''}")
    except Exception as exc:
        print(f"resolved_runner_error: {exc}")


def _command_check_editor(args: argparse.Namespace) -> None:
    input_json = Path(args.input).resolve()
    _run_editor_check(input_json, strict=args.strict)
    print(f"OK: {input_json}")


def _command_profile(args: argparse.Namespace) -> None:
    if args.profile != "editor_safe":
        raise ValueError(f"unsupported profile: {args.profile}")

    input_json = Path(args.input).resolve()
    out_json = Path(args.output).resolve()

    doc = load_json(input_json)
    alias, src, mode = pick_source(doc)
    prof = to_editor_safe_profile(src, keep_bookworld=not args.drop_bookworld)
    if mode == "new":
        out_obj = {alias: prof}
    else:
        out_obj = prof
    save_json(out_json, out_obj)
    print(f"OK: {out_json}")

    if args.to_xbs:
        out_xbs = Path(args.to_xbs).resolve()
        _run_xbsrebuild("json2xbs", out_json, out_xbs)
        print(f"OK: {out_xbs}")


def _command_build_ab(args: argparse.Namespace) -> None:
    input_json = Path(args.input).resolve()
    out_dir = Path(args.output_dir).resolve()
    prefix = args.prefix

    doc = load_json(input_json)
    alias, src, mode = pick_source(doc)
    variants = build_ab_variants(src)

    out_dir.mkdir(parents=True, exist_ok=True)
    for name, obj in variants.items():
        out_json = out_dir / f"{prefix}_{name}.json"
        if mode == "new":
            out_obj = {alias: obj}
        else:
            out_obj = obj
        save_json(out_json, out_obj)
        print(f"OK: {out_json}")
        if args.to_xbs:
            out_xbs = out_dir / f"{prefix}_{name}.xbs"
            _run_xbsrebuild("json2xbs", out_json, out_xbs)
            print(f"OK: {out_xbs}")


def _iter_json_files(path: Path) -> list[Path]:
    if path.is_file():
        if path.suffix.lower() == ".json":
            return [path]
        return []
    return sorted([p for p in path.rglob("*.json") if p.is_file()])


def _is_strong_book_source(source: dict[str, object], mode: str) -> bool:
    if not isinstance(source, dict):
        return False
    has_action = any(k in source for k in CORE_ACTIONS) or "bookWorld" in source
    if mode == "new":
        return has_action and ("sourceName" in source) and ("sourceUrl" in source)
    return has_action and ("bookSourceName" in source) and ("bookSourceUrl" in source)


def _command_normalize_2561(args: argparse.Namespace) -> None:
    input_path = Path(args.input).resolve()
    report_path = Path(args.report).resolve() if args.report else None
    backup_suffix = args.backup_suffix
    default_weight = str(args.default_weight)

    files = _iter_json_files(input_path)
    if not files:
        raise RuntimeError(f"no json files found: {input_path}")

    changed_json_count = 0
    rebuilt_xbs_count = 0
    skipped_count = 0
    failed_count = 0
    details: list[dict[str, str | list[str] | bool]] = []

    for p in files:
        try:
            doc = load_json(p)
        except Exception:
            skipped_count += 1
            details.append({"path": str(p), "status": "skip", "reason": "invalid_json"})
            continue

        try:
            alias, src, mode = pick_source(doc)
        except Exception:
            skipped_count += 1
            details.append({"path": str(p), "status": "skip", "reason": "not_book_source"})
            continue
        if not _is_strong_book_source(src, mode):
            skipped_count += 1
            details.append({"path": str(p), "status": "skip", "reason": "weak_match_non_source"})
            continue

        try:
            normalized, changes = normalize_source_for_2561(src, default_weight=default_weight)
            if not changes:
                details.append({"path": str(p), "status": "skip", "reason": "no_change"})
                skipped_count += 1
                continue

            backup_path = p.with_name(p.name + backup_suffix)
            if not backup_path.exists():
                shutil.copy2(p, backup_path)

            if mode == "new":
                out_obj = dict(doc)
                out_obj[alias] = normalized
            else:
                out_obj = normalized
            save_json(p, out_obj)
            changed_json_count += 1

            rebuilt = False
            rebuilt_xbs_path = ""
            if args.rebuild_xbs:
                xbs_path = p.with_suffix(".xbs")
                _run_xbsrebuild("json2xbs", p, xbs_path)
                rebuilt = True
                rebuilt_xbs_count += 1
                rebuilt_xbs_path = str(xbs_path)

            details.append(
                {
                    "path": str(p),
                    "status": "changed",
                    "changes": changes,
                    "backup": str(backup_path),
                    "rebuild_xbs": rebuilt,
                    "xbs_path": rebuilt_xbs_path,
                }
            )
        except Exception as exc:
            failed_count += 1
            details.append({"path": str(p), "status": "failed", "reason": str(exc)})

    summary = {
        "input": str(input_path),
        "default_weight": default_weight,
        "total_json_scanned": len(files),
        "changed_json_count": changed_json_count,
        "rebuilt_xbs_count": rebuilt_xbs_count,
        "skipped_count": skipped_count,
        "failed_count": failed_count,
        "details": details,
    }

    if report_path:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with report_path.open("w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        print(f"REPORT: {report_path}")

    print(f"TOTAL_JSON_SCANNED: {len(files)}")
    print(f"CHANGED_JSON_COUNT: {changed_json_count}")
    print(f"REBUILT_XBS_COUNT: {rebuilt_xbs_count}")
    print(f"SKIPPED_COUNT: {skipped_count}")
    print(f"FAILED_COUNT: {failed_count}")

    if failed_count > 0:
        print("FAILED_FILES:")
        for d in details:
            if d.get("status") == "failed":
                print(f"- {d['path']}: {d['reason']}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Cross-platform xbs conversion helper for JSON <-> XBS."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p1 = sub.add_parser("json2xbs", help="Convert JSON to XBS")
    p1.add_argument("-i", "--input", required=True, help="Input JSON path")
    p1.add_argument("-o", "--output", required=True, help="Output XBS path")
    p1.add_argument(
        "--skip-schema-check",
        action="store_true",
        help="Skip xiangse schema guard before conversion",
    )
    p1.add_argument(
        "--strict-requestinfo",
        action="store_true",
        help="Treat method:/data:/headers: in requestInfo as schema errors.",
    )
    p1.set_defaults(func=_command_json2xbs)

    p2 = sub.add_parser("xbs2json", help="Convert XBS to JSON")
    p2.add_argument("-i", "--input", required=True, help="Input XBS path")
    p2.add_argument("-o", "--output", required=True, help="Output JSON path")
    p2.set_defaults(func=_command_xbs2json)

    p3 = sub.add_parser("roundtrip", help="Convert JSON -> XBS -> JSON")
    p3.add_argument("-i", "--input", required=True, help="Input JSON path")
    p3.add_argument("-p", "--prefix", required=True, help="Output prefix path")
    p3.add_argument(
        "--skip-schema-check",
        action="store_true",
        help="Skip xiangse schema guard before conversion",
    )
    p3.add_argument(
        "--strict-requestinfo",
        action="store_true",
        help="Treat method:/data:/headers: in requestInfo as schema errors.",
    )
    p3.set_defaults(func=_command_roundtrip)

    p4 = sub.add_parser("doctor", help="Show environment diagnosis")
    p4.set_defaults(func=_command_doctor)

    p5 = sub.add_parser("check-editor", help="Check StandarReader editor-save compatibility risks")
    p5.add_argument("-i", "--input", required=True, help="Input JSON path")
    p5.add_argument(
        "--strict",
        action="store_true",
        help="Fail on medium/high risk (default only fail on high risk)",
    )
    p5.set_defaults(func=_command_check_editor)

    p6 = sub.add_parser("profile", help="Generate compatibility profile JSON")
    p6.add_argument("-i", "--input", required=True, help="Input JSON path")
    p6.add_argument("-o", "--output", required=True, help="Output JSON path")
    p6.add_argument(
        "--profile",
        default="editor_safe",
        choices=["editor_safe"],
        help="Compatibility profile name",
    )
    p6.add_argument(
        "--drop-bookworld",
        action="store_true",
        help="Drop bookWorld in generated profile JSON",
    )
    p6.add_argument(
        "--to-xbs",
        help="Optional output XBS path. Converted with schema-check bypass semantics.",
    )
    p6.set_defaults(func=_command_profile)

    p7 = sub.add_parser("build-ab", help="Generate A0-A3 editor-save A/B variants")
    p7.add_argument("-i", "--input", required=True, help="Input JSON path")
    p7.add_argument("-d", "--output-dir", required=True, help="Output directory")
    p7.add_argument(
        "--prefix",
        default="source_editor_ab",
        help="Output file prefix (default: source_editor_ab)",
    )
    p7.add_argument(
        "--to-xbs",
        action="store_true",
        help="Also convert each variant JSON to XBS",
    )
    p7.set_defaults(func=_command_build_ab)

    p8 = sub.add_parser("normalize-2561", help="Normalize book sources for StandarReader 2.56.1 save compatibility")
    p8.add_argument(
        "-i",
        "--input",
        required=True,
        help="Input JSON file or directory (recursive for directory)",
    )
    p8.add_argument(
        "--default-weight",
        default="9999",
        help="Default weight string when missing/invalid (default: 9999)",
    )
    p8.add_argument(
        "--backup-suffix",
        default=".bak_2561",
        help="Backup suffix for changed JSON files (default: .bak_2561)",
    )
    p8.add_argument(
        "--rebuild-xbs",
        action="store_true",
        help="Rebuild same-name .xbs after JSON normalization",
    )
    p8.add_argument(
        "--report",
        help="Optional report JSON output path",
    )
    p8.set_defaults(func=_command_normalize_2561)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
