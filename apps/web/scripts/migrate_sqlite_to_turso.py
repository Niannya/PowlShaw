#!/usr/bin/env python3
"""把旧版 `poxiao.db`（30 张表）清洗、瘦身为上云用的 20 张表，并导出 Turso 可导入的 SQL。

用法：
    python apps/web/scripts/migrate_sqlite_to_turso.py \
        --db /path/to/poxiao.db \
        --out build/powlshaw_turso.sql

脚本只读取 `--db` 指定的数据库，所有修改都在临时工作副本上完成，不会改动原文件。
需要的 SQLite 版本 >= 3.35（`ALTER TABLE ... DROP COLUMN`）；Python 3.11+ 自带的
sqlite3 已满足。

清洗内容（对应《PowlShaw-Vercel 云原生重写方案》第六节）：
1. 剥离 `articles` / `events` 存量正文中的 `<img>` 与 Markdown 图片；
2. 删除 `event_documents` 中 jpg/jpeg/png 附件记录（去图片化后不再接受图片）；
3. 删除 12 张废弃表：4 张图片/分类 + 6 张地图 + 2 张历史表；
4. 删除 `authors.avatar_url`、`articles.cover_url`、`events.banner_url`；
5. 新增 `articles.visual_theme`、`events.visual_theme`；
6. 重建 `content_revisions`，把 `target_type` 枚举扩为 `article/event/event_extension/category`；
7. 创建 `event_extensions` / `event_extension_items` 两张扩展表与索引；
8. `VACUUM` 后导出纯 SQL（可直接 `turso db shell <db> < out.sql`）。

注意：`event_documents` 中保留下来的文档仍指向旧的 `/uploads/...` 路径。Vercel 不再提供
本地文件服务，部署前需要把实际文件重新上传到 Vercel Blob，并更新 `file_url`。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile

# Windows 控制台默认可能是 GBK，统一按 UTF-8 输出，避免中文提示乱码。
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:  # pragma: no cover - 仅影响旧环境
    pass

MAP_TABLES = [
    "event_map_settings",
    "event_map_nodes",
    "event_map_node_articles",
    "event_map_relations",
    "event_map_regions",
    "event_map_snapshots",
]

DROP_TABLES = [
    "uploaded_assets",
    "media",
    "article_categories",
    "categories",
    "event_map_node_articles",
    "event_map_relations",
    "event_map_regions",
    "event_map_nodes",
    "event_map_snapshots",
    "event_map_settings",
    "pages",
    "comments_archive",
]

EXPECTED_TABLES = {
    "authors",
    "articles",
    "events",
    "event_articles",
    "event_sections",
    "event_documents",
    "users",
    "comments",
    "user_login_attempts",
    "notifications",
    "admin_credentials",
    "admin_audit_log",
    "content_revisions",
    "request_rate_limits",
    "slug_redirects",
    "site_settings",
    "treat_stats",
    "user_treat_stats",
    "event_extensions",
    "event_extension_items",
}

IMG_TAG_RE = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
MD_IMG_RE = re.compile(r"!\[[^\]]*\]\([^)]+\)")

EXTENSION_DDL = """
CREATE TABLE IF NOT EXISTS event_extensions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,
  version          INTEGER NOT NULL DEFAULT 1,
  enabled          INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  visibility       TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'member')),
  allow_user_items INTEGER NOT NULL DEFAULT 0 CHECK (allow_user_items IN (0, 1)),
  config_json      TEXT NOT NULL DEFAULT '{}',
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_event_ext ON event_extensions (event_id, enabled, sort_order);

CREATE TABLE IF NOT EXISTS event_extension_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  extension_id INTEGER NOT NULL REFERENCES event_extensions(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  item_key     TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (extension_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_event_ext_items ON event_extension_items (extension_id, created_at);
"""

CONTENT_REVISIONS_DDL = """
CREATE TABLE content_revisions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL
    CHECK (target_type IN ('article', 'event', 'event_extension', 'category')),
  target_id INTEGER NOT NULL,
  action TEXT NOT NULL
    CHECK (action IN ('create', 'update', 'delete', 'update-articles')),
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def table_names(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {row[0] for row in rows}


def column_names(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def strip_embedded_images(conn: sqlite3.Connection) -> int:
    """返回被修改的正文行数。"""
    changed = 0
    for table in ("articles", "events"):
        columns = column_names(conn, table)
        if not columns:
            continue
        select_columns = [
            name for name in ("content_html", "content_markdown") if name in columns
        ]
        if not select_columns:
            continue
        rows = conn.execute(f"SELECT id, {', '.join(select_columns)} FROM {table}").fetchall()
        for row in rows:
            row_id = row[0]
            values = list(row[1:])
            cleaned = []
            dirty = False
            for name, value in zip(select_columns, values):
                text = value or ""
                next_text = MD_IMG_RE.sub("", text) if name == "content_markdown" else text
                next_text = IMG_TAG_RE.sub("", next_text)
                cleaned.append(next_text)
                if next_text != text:
                    dirty = True
            if not dirty:
                continue
            assignments = ", ".join(f"{name}=?" for name in select_columns)
            conn.execute(
                f"UPDATE {table} SET {assignments} WHERE id=?",
                (*cleaned, row_id),
            )
            changed += 1
    return changed


def delete_image_documents(conn: sqlite3.Connection) -> int:
    if "event_documents" not in table_names(conn):
        return 0
    cursor = conn.execute(
        """
        DELETE FROM event_documents
        WHERE lower(file_url) LIKE '%.jpg'
           OR lower(file_url) LIKE '%.jpeg'
           OR lower(file_url) LIKE '%.png'
        """
    )
    return cursor.rowcount


def archive_map_tables(conn: sqlite3.Connection, archive_path: str | None) -> str | None:
    """在删除 6 张地图表前把它们导出为 JSON，满足方案里“迁移前可归档”的要求。"""
    if not archive_path:
        return None
    existing = table_names(conn)
    payload: dict[str, list[dict[str, object]]] = {}
    for table in MAP_TABLES:
        if table not in existing:
            continue
        columns = [row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        rows = conn.execute(f"SELECT * FROM {table}").fetchall()
        payload[table] = [dict(zip(columns, row)) for row in rows]
    if not payload:
        return None
    archive_path = os.path.abspath(archive_path)
    os.makedirs(os.path.dirname(archive_path) or ".", exist_ok=True)
    with open(archive_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return archive_path


def drop_legacy_tables(conn: sqlite3.Connection) -> list[str]:
    existing = table_names(conn)
    dropped = []
    for table in DROP_TABLES:
        if table in existing:
            conn.execute(f"DROP TABLE IF EXISTS {table}")
            dropped.append(table)
    return dropped


def drop_image_columns(conn: sqlite3.Connection) -> list[str]:
    removed = []
    for table, column in (
        ("authors", "avatar_url"),
        ("articles", "cover_url"),
        ("events", "banner_url"),
    ):
        if column in column_names(conn, table):
            conn.execute(f"ALTER TABLE {table} DROP COLUMN {column}")
            removed.append(f"{table}.{column}")
    return removed


def add_visual_theme_columns(conn: sqlite3.Connection) -> list[str]:
    added = []
    for table in ("articles", "events"):
        if "visual_theme" not in column_names(conn, table):
            conn.execute(
                f"ALTER TABLE {table} ADD COLUMN visual_theme TEXT NOT NULL DEFAULT 'auto'"
            )
            added.append(f"{table}.visual_theme")
    return added


def rebuild_content_revisions(conn: sqlite3.Connection) -> bool:
    if "content_revisions" not in table_names(conn):
        return False
    current_sql = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='content_revisions'"
    ).fetchone()
    if current_sql and "event_extension" in (current_sql[0] or ""):
        return False

    conn.execute("DROP TABLE IF EXISTS content_revisions_new")
    conn.execute(CONTENT_REVISIONS_DDL)
    conn.execute(
        """
        INSERT INTO content_revisions_new(id, target_type, target_id, action, snapshot_json, created_at)
        SELECT id, target_type, target_id, action, snapshot_json, created_at
        FROM content_revisions
        """
    )
    conn.execute("DROP TABLE content_revisions")
    conn.execute("ALTER TABLE content_revisions_new RENAME TO content_revisions")
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_content_revisions_target
        ON content_revisions(target_type, target_id, created_at DESC)
        """
    )
    return True


def create_extension_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(EXTENSION_DDL)


def verify(conn: sqlite3.Connection) -> None:
    tables = table_names(conn)
    missing = EXPECTED_TABLES - tables
    extra = tables - EXPECTED_TABLES
    if missing:
        raise SystemExit(f"迁移失败：缺少表 {sorted(missing)}")
    if extra:
        raise SystemExit(f"迁移失败：仍存在多余表 {sorted(extra)}")
    for table in ("articles", "events"):
        row = conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE content_html LIKE '%<img%'"
        ).fetchone()
        if row and row[0]:
            raise SystemExit(f"迁移失败：{table} 仍有 {row[0]} 行包含 <img")
    if "avatar_url" in column_names(conn, "authors"):
        raise SystemExit("迁移失败：authors.avatar_url 未删除")
    if "cover_url" in column_names(conn, "articles"):
        raise SystemExit("迁移失败：articles.cover_url 未删除")
    if "banner_url" in column_names(conn, "events"):
        raise SystemExit("迁移失败：events.banner_url 未删除")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, help="旧版 SQLite 数据库路径（只读）")
    parser.add_argument(
        "--out",
        default="powlshaw_turso.sql",
        help="导出的 Turso 导入 SQL 路径（默认 powlshaw_turso.sql）",
    )
    parser.add_argument("--keep-documents", action="store_true", help="保留 event_documents 中的图片记录")
    parser.add_argument(
        "--archive-maps",
        action="store_true",
        help="删除地图表前导出 <out>.maps.json（归档列国纪数据）",
    )
    args = parser.parse_args()

    source = os.path.abspath(args.db)
    if not os.path.isfile(source):
        raise SystemExit(f"找不到数据库：{source}")

    with tempfile.TemporaryDirectory(prefix="powlshaw-migrate-") as temp_dir:
        work = os.path.join(temp_dir, "poxiao_clean.db")
        shutil.copy2(source, work)
        conn = sqlite3.connect(work)
        try:
            before_tables = table_names(conn)
            if not before_tables:
                raise SystemExit("数据库中没有找到任何表，请确认 --db 路径。")

            conn.execute("PRAGMA foreign_keys=OFF")
            conn.execute("BEGIN")
            map_archive = archive_map_tables(
                conn, f"{os.path.abspath(args.out)}.maps.json" if args.archive_maps else None
            )
            changed_rows = strip_embedded_images(conn)
            deleted_images = 0 if args.keep_documents else delete_image_documents(conn)
            dropped = drop_legacy_tables(conn)
            removed_columns = drop_image_columns(conn)
            added_columns = add_visual_theme_columns(conn)
            revisions_rebuilt = rebuild_content_revisions(conn)
            create_extension_tables(conn)
            conn.commit()

            verify(conn)
            conn.execute("VACUUM")

            dump = list(conn.iterdump())

            print("清洗完成：")
            print(f"  正文去图行数      : {changed_rows}")
            print(f"  删除图片附件记录  : {deleted_images}")
            print(f"  删除废弃表        : {len(dropped)} {', '.join(dropped) if dropped else ''}")
            print(f"  地图归档          : {map_archive or '未启用（--archive-maps）'}")
            print(f"  删除图片列        : {', '.join(removed_columns) or '无'}")
            print(f"  新增主题列        : {', '.join(added_columns) or '无'}")
            print(f"  重建修订表        : {'是' if revisions_rebuilt else '否（已兼容）'}")
            print(f"  最终业务表数量    : {len(table_names(conn))}")
        finally:
            conn.close()

        out_path = os.path.abspath(args.out)
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        with open(out_path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("PRAGMA foreign_keys=OFF;\n")
            handle.write("BEGIN TRANSACTION;\n")
            for line in dump:
                if line.strip() in {"BEGIN TRANSACTION;", "COMMIT;"}:
                    continue
                handle.write(f"{line}\n")
            handle.write("COMMIT;\n")

    print(f"已导出 Turso 导入 SQL：{out_path}")
    print("下一步：turso db create powlshaw && turso db shell powlshaw < " + out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
