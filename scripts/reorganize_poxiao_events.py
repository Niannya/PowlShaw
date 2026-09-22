"""Split the 2019 summer works and arrange numbered 破晓 archives by round.

This migration preserves article IDs, slugs, comments, content and uploaded
assets. It only moves four event links, adjusts generated archive descriptions,
and updates event-specific section paths / order.
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
SUMMER_SLUG = "summer-2019"
SOURCE_PREFIX = "local:activity-archive/2.第二届破晓/"


def migrate(db: sqlite3.Connection) -> dict[str, int]:
    db.execute("PRAGMA foreign_keys=ON")
    second = db.execute("SELECT id,content_html FROM events WHERE slug='second-poxiao'").fetchone()
    if second is None:
        raise ValueError("找不到第二届破晓，已停止迁移。")
    second_id, second_content = second

    summer_works = db.execute(
        "SELECT id,slug,excerpt FROM articles WHERE legacy_url LIKE ? AND legacy_url LIKE ? "
        "ORDER BY id",
        (SOURCE_PREFIX + "%", "%夏活%"),
    ).fetchall()
    if len(summer_works) != 4:
        raise ValueError(f"预期找到 4 篇 2019 夏活作品，实际 {len(summer_works)} 篇；未修改数据库。")

    summer = db.execute("SELECT id FROM events WHERE slug=?", (SUMMER_SLUG,)).fetchone()
    if summer is None:
        cursor = db.execute(
            "INSERT INTO events(slug,title,event_group,summary,content_html,status_override,sort_order) "
            "VALUES (?,?,?,?,?,'ended',245)",
            (
                SUMMER_SLUG,
                "2019夏活",
                "other",
                "从第二届破晓资料中独立整理的 SCU-SFA 写作组夏活作品。",
                "",
            ),
        )
        summer_id = int(cursor.lastrowid)
    else:
        summer_id = int(summer[0])

    for position, (article_id, _slug, excerpt) in enumerate(summer_works, 1):
        old_link = db.execute(
            "SELECT sort_order FROM event_articles WHERE event_id=? AND article_id=?",
            (second_id, article_id),
        ).fetchone()
        new_link = db.execute(
            "SELECT sort_order FROM event_articles WHERE event_id=? AND article_id=?",
            (summer_id, article_id),
        ).fetchone()
        if old_link is None and new_link is None:
            raise ValueError(f"作品 {article_id} 未关联第二届破晓或 2019夏活；已停止迁移。")
        if new_link is None:
            db.execute(
                "INSERT INTO event_articles(event_id,article_id,section_path,sort_order) "
                "VALUES (?,?,'',?)",
                (summer_id, article_id, position * 10),
            )
        db.execute(
            "DELETE FROM event_articles WHERE event_id=? AND article_id=?",
            (second_id, article_id),
        )
        if excerpt.startswith("第二届破晓"):
            body = excerpt.partition("｜")[2]
            db.execute(
                "UPDATE articles SET excerpt=? WHERE id=?",
                ("2019夏活" + ("｜" + body if body else ""), article_id),
            )

    remaining = db.execute(
        "SELECT COUNT(*) FROM event_articles WHERE event_id=?", (second_id,)
    ).fetchone()[0]
    revised_content = re.sub(
        r"共收录\s*\d+\s*篇作品",
        f"共收录 {remaining} 篇作品",
        second_content,
        count=1,
    )
    if revised_content != second_content:
        db.execute(
            "UPDATE events SET content_html=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (revised_content, second_id),
        )

    poxiao_events = db.execute(
        "SELECT id FROM events WHERE event_group='poxiao' ORDER BY id"
    ).fetchall()
    total = sum(restructure_poxiao_event(db, int(row[0])) for row in poxiao_events)
    return {"summer_works": len(summer_works), "poxiao_events": len(poxiao_events), "poxiao_works": total}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()
    path = args.database.resolve()
    if not path.is_file():
        raise FileNotFoundError(path)

    with sqlite3.connect(path, timeout=30) as db:
        # SQLite's backup API includes any uncheckpointed WAL changes.
        backup_dir = path.parent / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup_path = backup_dir / (
            "before-summer-2019-and-poxiao-rounds-"
            + datetime.now().strftime("%Y%m%d-%H%M%S")
            + ".db"
        )
        with sqlite3.connect(backup_path) as backup:
            db.backup(backup)
            if backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("数据库备份校验失败；未执行迁移。")

        with db:
            result = migrate(db)
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("数据库完整性检查失败；迁移已回滚。")

    print(f"备份：{backup_path}")
    print(
        f"完成：2019夏活 {result['summer_works']} 篇；"
        f"整理破晓 {result['poxiao_events']} 届 / {result['poxiao_works']} 篇。"
    )


if __name__ == "__main__":
    main()
