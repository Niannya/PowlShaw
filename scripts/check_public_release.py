#!/usr/bin/env python3
"""Fail when Git would publish local runtime data, secrets, or user-specific paths."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_PATHS = {
    ".env.local",
    "破晓相关.zip",
    "网站残骸.xml",
}
FORBIDDEN_PREFIXES = (
    ".next/",
    ".pnpm-store/",
    "data/backups/",
    "data/private-archive-files/",
    "node_modules/",
    "output/",
    "public/uploads/",
    "tmp/",
    "破晓相关/",
)
SENSITIVE_TEXT_PATTERNS = (
    (
        re.compile(r"(?i)(?:ADMIN_PASSWORD|SESSION_SECRET)\s*=\s*(?!replace-|ci-only-)[^\s]+"),
        "真实凭据",
    ),
    (re.compile(r"(?i)C:[/\\]Users[/\\][^/\\\s]+"), "用户目录绝对路径"),
    (re.compile(r"(?i)[A-Z]:[/\\](?:Project|Users)[/\\]"), "本机绝对路径"),
)


def git_candidates() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [item for item in result.stdout.decode("utf-8").split("\0") if item]


def main() -> int:
    try:
        candidates = git_candidates()
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("公开检查失败：请先安装 Git 并在项目目录运行 git init。")
        return 2

    errors: list[str] = []
    for relative in candidates:
        normalized = relative.replace("\\", "/")
        if normalized in FORBIDDEN_PATHS or normalized.endswith((".db", ".db-shm", ".db-wal")):
            errors.append(f"禁止公开的文件：{normalized}")
            continue
        if any(normalized.startswith(prefix) for prefix in FORBIDDEN_PREFIXES):
            if normalized not in {"data/.gitkeep", "public/uploads/.gitkeep"}:
                errors.append(f"禁止公开的目录内容：{normalized}")
            continue

        path = ROOT / relative
        if not path.is_file():
            continue
        size = path.stat().st_size
        if size > 50 * 1024 * 1024:
            errors.append(f"文件超过 50 MB，不适合直接提交 Git：{normalized}")
            continue
        if size > 5 * 1024 * 1024:
            continue
        raw = path.read_bytes()
        if b"\0" in raw:
            continue
        text = raw.decode("utf-8", errors="ignore")
        for pattern, label in SENSITIVE_TEXT_PATTERNS:
            if pattern.search(text):
                errors.append(f"{normalized}：发现{label}")

    if errors:
        print("公开检查未通过：")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"公开检查通过：{len(candidates)} 个候选文件，未发现本地数据库、私密归档或明显凭据。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
