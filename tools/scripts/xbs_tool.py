#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _default_xbsrebuild_root(repo_root: Path) -> Path | None:
    candidates = [
        repo_root.parent / "xbsrebuild",
        repo_root / "xbsrebuild",
    ]
    for path in candidates:
        if path.exists():
            return path
    return None


def _resolve_runner(repo_root: Path) -> tuple[list[str], Path | None]:
    # 1) explicit binary path from env
    env_bin = os.environ.get("XBSREBUILD_BIN", "").strip()
    if env_bin:
        bin_path = Path(env_bin).expanduser().resolve()
        if not bin_path.exists():
            raise FileNotFoundError(f"XBSREBUILD_BIN not found: {bin_path}")
        return [str(bin_path)], None

    # 2) xbsrebuild in PATH
    path_bin = shutil.which("xbsrebuild")
    if path_bin:
        return [path_bin], None

    # 3) go run fallback
    xbsrebuild_root = os.environ.get("XBSREBUILD_ROOT", "").strip()
    if xbsrebuild_root:
        root = Path(xbsrebuild_root).expanduser().resolve()
    else:
        root = _default_xbsrebuild_root(repo_root)

    if not root or not root.exists():
        raise FileNotFoundError(
            "Cannot find xbsrebuild. Set XBSREBUILD_BIN or XBSREBUILD_ROOT, or install xbsrebuild in PATH."
        )

    if not shutil.which("go"):
        raise RuntimeError(
            "go command not found. Install Go or set XBSREBUILD_BIN to a prebuilt xbsrebuild executable."
        )

    return ["go", "run", "."], root


def _run_xbsrebuild(action: str, input_path: Path, output_path: Path) -> None:
    repo_root = _repo_root()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd_prefix, cwd = _resolve_runner(repo_root)
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


def _run_schema_check(input_json: Path) -> None:
    checker = Path(__file__).resolve().parent / "check_xiangse_schema.py"
    if not checker.exists():
        raise FileNotFoundError(f"schema checker not found: {checker}")
    cmd = [sys.executable, str(checker), str(input_json)]
    completed = subprocess.run(cmd)
    if completed.returncode != 0:
        raise RuntimeError(
            "xiangse schema check failed. Fix JSON first, or use --skip-schema-check if you really need to bypass."
        )


def _command_json2xbs(args: argparse.Namespace) -> None:
    input_json = Path(args.input).resolve()
    if not args.skip_schema_check:
        _run_schema_check(input_json)
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
        _run_schema_check(input_json)

    _run_xbsrebuild("json2xbs", input_json, xbs_path)
    _run_xbsrebuild("xbs2json", xbs_path, roundtrip_json)

    print("Roundtrip done:")
    print(f"- {xbs_path}")
    print(f"- {roundtrip_json}")


def _command_doctor(_: argparse.Namespace) -> None:
    repo_root = _repo_root()
    print(f"repo_root: {repo_root}")
    print(f"python: {sys.executable}")
    print(f"go_in_path: {shutil.which('go') or ''}")
    print(f"xbsrebuild_in_path: {shutil.which('xbsrebuild') or ''}")
    print(f"XBSREBUILD_BIN: {os.environ.get('XBSREBUILD_BIN', '')}")
    print(f"XBSREBUILD_ROOT: {os.environ.get('XBSREBUILD_ROOT', '')}")
    try:
        cmd, cwd = _resolve_runner(repo_root)
        print(f"resolved_runner: {' '.join(cmd)}")
        print(f"resolved_cwd: {cwd or ''}")
    except Exception as exc:
        print(f"resolved_runner_error: {exc}")


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
    p3.set_defaults(func=_command_roundtrip)

    p4 = sub.add_parser("doctor", help="Show environment diagnosis")
    p4.set_defaults(func=_command_doctor)

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
