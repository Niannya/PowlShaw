"""Move old public raw-document copies outside Next.js's public directory.

The original documents in 破晓相关 are never touched. Body images remain
public; only imported ``source.*`` files and the old first-archive ZIP move.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_EVENTS = ROOT / "public" / "uploads" / "events"
PRIVATE_EVENTS = ROOT / "data" / "private-archive-files"
SOURCE_SUFFIXES = {".docx", ".doc", ".rtf", ".pdf", ".txt"}


def digest(path: Path) -> str:
    hash_value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hash_value.update(block)
    return hash_value.hexdigest()


def public_raw_files() -> list[Path]:
    documents = [
        path
        for path in (PUBLIC_EVENTS / "archive-import").rglob("*")
        if path.is_file() and path.stem == "source" and path.suffix.lower() in SOURCE_SUFFIXES
    ]
    first_zip = PUBLIC_EVENTS / "first-poxiao" / "first-poxiao-archive.zip"
    if first_zip.is_file():
        documents.append(first_zip)
    return sorted(documents)


def move_public_copies(dry_run: bool) -> tuple[int, int]:
    root = ROOT.resolve()
    public_root = PUBLIC_EVENTS.resolve()
    private_root = PRIVATE_EVENTS.resolve()
    if not public_root.is_relative_to(root) or not private_root.is_relative_to(root):
        raise ValueError("源或目标目录不在项目内，已停止。")

    files = public_raw_files()
    total_bytes = sum(path.stat().st_size for path in files)
    if dry_run:
        return len(files), total_bytes

    plans: list[tuple[Path, Path]] = []
    for source in files:
        if source.is_symlink() or not source.resolve().is_relative_to(public_root):
            raise ValueError(f"意外的公开文件路径：{source}")
        target = PRIVATE_EVENTS / source.relative_to(PUBLIC_EVENTS)
        if not target.resolve().is_relative_to(private_root) or target.exists():
            raise ValueError(f"意外的目标路径或目标已存在：{target}")
        plans.append((source, target))

    PRIVATE_EVENTS.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, str | int]] = []
    for source, target in plans:
        target.parent.mkdir(parents=True, exist_ok=True)
        size = source.stat().st_size
        sha256 = digest(source)
        source.rename(target)
        manifest.append(
            {
                "old_public_path": source.relative_to(ROOT).as_posix(),
                "private_path": target.relative_to(ROOT).as_posix(),
                "bytes": size,
                "sha256": sha256,
            }
        )
    (PRIVATE_EVENTS / "move-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return len(files), total_bytes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    count, size = move_public_copies(args.dry_run)
    action = "将移动" if args.dry_run else "已移至私有目录"
    print(f"{action}：{count} 个公开副本，{size:,} 字节。")


if __name__ == "__main__":
    main()
