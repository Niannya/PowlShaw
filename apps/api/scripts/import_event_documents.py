"""Publish review sheets and related event records as individual downloads.

Original files under ``破晓相关`` remain untouched. This importer deliberately
does not publish work manuscripts or the old all-in-one archive ZIP.

Run ``python scripts/import_event_documents.py --dry-run`` to audit the planned
files, then run without ``--dry-run`` to copy files and update SQLite.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import Counter
from datetime import datetime
from pathlib import Path
from shutil import copy2
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

from import_remaining_activities import ARCHIVE_ROOT, DATABASE_PATH, EVENTS, PROJECT_ROOT


PUBLIC_ROOT = PROJECT_ROOT / "public" / "uploads" / "events" / "documents"
REPORT_PATH = PROJECT_ROOT / "data" / "event_documents_import_report.json"
ALLOWED_SUFFIXES = {
    ".xlsx", ".xls", ".csv", ".docx", ".doc", ".rtf",
    ".pdf", ".txt", ".jpg", ".jpeg", ".png",
}
REVIEW_MARKERS = (
    "评议", "评审", "编辑评价", "评委点评", "晋级名单", "决赛名单", "通过表",
    "总分", "统计", "投票理由", "投票结果", "猜作者", "颁奖表", "条目表",
    "活动表", "作品编号表", "对战表", "结果表",
)
ROOT_EVENTS = {
    "1.第一届破晓": "first-poxiao",
    "2.第二届破晓": "second-poxiao",
    "3.第三届破晓": "third-poxiao",
    "4.第四届破晓": "fourth-poxiao",
    "5.第五届破晓": "fifth-poxiao",
    "6.第六届破晓": "sixth-poxiao",
    "7.第七届破晓": "seventh-poxiao",
    "8.第八届破晓": "eighth-poxiao",
    "9.第九届破晓": "ninth-poxiao",
}
# 作品在「作品」子目录中，资料表在活动目录本身，因此补上该活动目录。
EXTRA_EVENT_DIRS = {
    "5.第五届破晓/第五届破晓关键词+评议表": "fifth-poxiao",
    "9.第九届破晓/2026夏日活动-融合写作": "summer-2026-fusion",
}


def has_review_sheet(path: Path) -> bool:
    """Catch spreadsheets with generic filenames but clearly named review tabs."""
    if path.suffix.lower() != ".xlsx":
        return False
    try:
        with ZipFile(path) as archive:
            workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
        return any(
            any(marker in sheet.attrib.get("name", "") for marker in ("评议", "评审", "猜作者", "评分"))
            for sheet in workbook.iter()
            if sheet.tag.endswith("}sheet")
        )
    except (BadZipFile, KeyError, ElementTree.ParseError):
        return False


def is_event_document(path: Path) -> bool:
    if path.name.startswith("~$") or path.suffix.lower() not in ALLOWED_SUFFIXES:
        return False
    # Check the basename, not parent folder: a work in a directory named
    # “关键词+评议表” is still a work, not a review document.
    return any(marker in path.stem for marker in REVIEW_MARKERS) or has_review_sheet(path)


def event_slug_for(relative_path: Path) -> str | None:
    relative = relative_path.as_posix()
    for directory, slug in EXTRA_EVENT_DIRS.items():
        if relative.startswith(directory + "/"):
            return slug

    matches: list[tuple[int, str]] = []
    for event in EVENTS:
        for source in event.sources:
            directory = source.relative_dir
            if not relative.startswith(directory + "/"):
                continue
            if not source.recursive and relative_path.parent.as_posix() != directory:
                continue
            if source.filename_contains and source.filename_contains not in relative_path.name:
                continue
            if source.filename_excludes and source.filename_excludes in relative_path.name:
                continue
            matches.append((len(directory), event.slug))
    if matches:
        return max(matches, key=lambda match: match[0])[1]
    # Root-level review tables belong to the numbered Poxiao event. Unknown
    # subdirectories should stop the import instead of silently misfiling a
    # separate seasonal activity under Poxiao.
    return ROOT_EVENTS.get(relative_path.parts[0]) if len(relative_path.parts) == 2 else None


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def collect_documents() -> list[dict[str, str | int | Path]]:
    documents: list[dict[str, str | int | Path]] = []
    for root_name in ROOT_EVENTS:
        root = ARCHIVE_ROOT / root_name
        if not root.is_dir():
            raise FileNotFoundError(f"缺少活动资料目录：{root}")
        for source in sorted(root.rglob("*")):
            if not source.is_file() or source.is_symlink() or not is_event_document(source):
                continue
            relative = source.relative_to(ARCHIVE_ROOT)
            slug = event_slug_for(relative)
            if not slug:
                raise ValueError(f"无法确定活动归属：{relative}")
            digest = file_digest(source)
            public_name = digest[:24] + source.suffix.lower()
            context = source.parent.relative_to(root).as_posix()
            documents.append({
                "event_slug": slug,
                "source_rel_path": relative.as_posix(),
                "display_name": source.name,
                "context_label": "" if context == "." else context.replace("/", " / "),
                "file_url": f"/uploads/events/documents/{slug}/{public_name}",
                "file_size": source.stat().st_size,
                "sha256": digest,
                "source": source,
                "target": PUBLIC_ROOT / slug / public_name,
            })
    return sorted(documents, key=lambda item: (str(item["event_slug"]), str(item["source_rel_path"])))


def ensure_table(db: sqlite3.Connection) -> None:
    # Keep this definition in sync with src/lib/db-schema.ts. Python importers
    # may run before the Next.js server starts and executes its own migration.
    db.executescript("""
        CREATE TABLE IF NOT EXISTS event_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          source_rel_path TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          context_label TEXT NOT NULL DEFAULT '',
          file_url TEXT NOT NULL,
          file_size INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_event_documents_event
          ON event_documents(event_id, sort_order);
    """)


def backup_database(db: sqlite3.Connection, database_path: Path) -> Path:
    backup_dir = database_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_path = backup_dir / f"poxiao-before-event-documents-{timestamp}.db"
    with sqlite3.connect(backup_path) as backup:
        db.backup(backup)
    return backup_path


def publish(documents: list[dict[str, str | int | Path]], database_path: Path) -> Path:
    if not database_path.is_file():
        raise FileNotFoundError(f"数据库不存在：{database_path}")
    db = sqlite3.connect(database_path)
    try:
        db.execute("PRAGMA foreign_keys = ON")
        event_ids = dict(db.execute("SELECT slug, id FROM events"))
        missing = sorted({str(item["event_slug"]) for item in documents} - event_ids.keys())
        if missing:
            raise ValueError(f"数据库中缺少活动：{', '.join(missing)}")
        backup_path = backup_database(db, database_path)
        ensure_table(db)

        order_by_event: Counter[str] = Counter()
        with db:
            for item in documents:
                slug = str(item["event_slug"])
                source = item["source"]
                target = item["target"]
                assert isinstance(source, Path) and isinstance(target, Path)
                if target.exists():
                    if file_digest(target) != item["sha256"]:
                        raise ValueError(f"目标文件摘要不符，未覆盖：{target}")
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    copy2(source, target)
                order_by_event[slug] += 1
                db.execute("""
                    INSERT INTO event_documents (
                      event_id, source_rel_path, display_name, context_label,
                      file_url, file_size, sort_order
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(source_rel_path) DO UPDATE SET
                      event_id=excluded.event_id,
                      display_name=excluded.display_name,
                      context_label=excluded.context_label,
                      file_url=excluded.file_url,
                      file_size=excluded.file_size,
                      sort_order=excluded.sort_order
                """, (
                    event_ids[slug], item["source_rel_path"], item["display_name"],
                    item["context_label"], item["file_url"], item["file_size"],
                    order_by_event[slug] * 10,
                ))
        return backup_path
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="只清点，不复制文件或修改数据库")
    parser.add_argument("--list", action="store_true", help="列出每个将公开的文件")
    parser.add_argument("--database", type=Path, default=DATABASE_PATH)
    args = parser.parse_args()

    documents = collect_documents()
    counts = Counter(str(item["event_slug"]) for item in documents)
    for slug, count in sorted(counts.items()):
        print(f"{slug}: {count}")
    print(f"合计：{len(documents)} 个评议及活动资料文件")
    if args.list:
        for item in documents:
            print(f"  {item['event_slug']}: {item['source_rel_path']}")
    if args.dry_run:
        return

    backup_path = publish(documents, args.database.resolve())
    REPORT_PATH.write_text(
        json.dumps({
            "count": len(documents),
            "by_event": dict(sorted(counts.items())),
            "files": [
                {key: item[key] for key in (
                    "event_slug", "source_rel_path", "display_name", "file_url", "file_size", "sha256"
                )}
                for item in documents
            ],
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"数据库备份：{backup_path}")
    print(f"导入报告：{REPORT_PATH}")


if __name__ == "__main__":
    main()
