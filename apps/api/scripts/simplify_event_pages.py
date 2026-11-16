"""Remove generated event archive blocks and imported article download links.

The original source files and article bodies are not deleted. Existing article
IDs, slugs, comments, images, event relations and summaries are preserved.
"""

from __future__ import annotations

import argparse
import re
import sqlite3
from datetime import datetime
from pathlib import Path

from event_archive_structure import restructure_poxiao_event


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "poxiao.db"
DOWNLOAD_LINK = re.compile(
    r'<p><a href="/uploads/events/archive-import/[^"<>]+/source\.'
    r'(?:docx|doc|rtf|pdf|txt)">下载原始文档（(?:DOCX|DOC|RTF|PDF|TXT)）</a></p>\s*$',
    re.IGNORECASE,
)


def remove_terminal_download_link(content_html: str) -> str:
    """Remove only the importer-added final paragraph, never links in the work."""
    return DOWNLOAD_LINK.sub("", content_html)


def simplify(db: sqlite3.Connection) -> dict[str, int]:
    db.execute("PRAGMA foreign_keys=ON")
    articles = db.execute(
        "SELECT id,content_html FROM articles "
        "WHERE legacy_url LIKE 'local:activity-archive/%' AND content_html LIKE '%下载原始文档%'"
    ).fetchall()
    for article_id, content_html in articles:
        revised = remove_terminal_download_link(content_html)
        if revised == content_html:
            raise ValueError(f"文章 {article_id} 的下载链接格式不符合预期；迁移已回滚。")
        db.execute(
            "UPDATE articles SET content_html=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (revised, article_id),
        )

    archive_events = db.execute(
        "SELECT id FROM events WHERE content_html LIKE '<h2>活动档案</h2>%'")
    event_ids = [row[0] for row in archive_events]
    db.executemany(
        "UPDATE events SET content_html='',content_markdown='',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        [(event_id,) for event_id in event_ids],
    )

    poxiao_ids = [
        row[0] for row in db.execute("SELECT id FROM events WHERE event_group='poxiao'")
    ]
    for event_id in poxiao_ids:
        restructure_poxiao_event(db, event_id)

    return {
        "article_links_removed": len(articles),
        "archive_blocks_removed": len(event_ids),
        "poxiao_events_reordered": len(poxiao_ids),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()
    path = args.database.resolve()
    if not path.is_file():
        raise FileNotFoundError(path)

    with sqlite3.connect(path, timeout=30) as db:
        backup_dir = path.parent / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup_path = backup_dir / (
            "before-event-page-simplification-"
            + datetime.now().strftime("%Y%m%d-%H%M%S-%f")
            + ".db"
        )
        with sqlite3.connect(backup_path) as backup:
            db.backup(backup)
            if backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("数据库备份校验失败；未执行迁移。")

        with db:
            result = simplify(db)
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("数据库完整性检查失败；迁移已回滚。")

    print(f"备份：{backup_path}")
    print(
        f"完成：移除 {result['article_links_removed']} 处文末下载链接，"
        f"{result['archive_blocks_removed']} 个活动档案块；"
        f"整理 {result['poxiao_events_reordered']} 届破晓决赛目录。"
    )


if __name__ == "__main__":
    main()
