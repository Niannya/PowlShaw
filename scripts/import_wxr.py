#!/usr/bin/env python3
"""Import a WordPress WXR export into the local Po Xiao SQLite database."""

from __future__ import annotations

import argparse
import html
import os
import re
import sqlite3
import sys
import urllib.parse
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

NS = {
    "wp": "http://wordpress.org/export/1.2/",
    "dc": "http://purl.org/dc/elements/1.1/",
    "content": "http://purl.org/rss/1.0/modules/content/",
    "excerpt": "http://wordpress.org/export/1.2/excerpt/",
}

SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS authors (id INTEGER PRIMARY KEY AUTOINCREMENT, legacy_id INTEGER UNIQUE, login TEXT UNIQUE, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', avatar_url TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, legacy_id INTEGER UNIQUE, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY AUTOINCREMENT, legacy_id INTEGER UNIQUE, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', content_html TEXT NOT NULL DEFAULT '', author_id INTEGER REFERENCES authors(id) ON DELETE SET NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')), published_at TEXT, cover_url TEXT, is_pinned INTEGER NOT NULL DEFAULT 0, legacy_url TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS article_categories (article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE, category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE, PRIMARY KEY(article_id,category_id));
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, legacy_category_id INTEGER UNIQUE, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', content_html TEXT NOT NULL DEFAULT '', starts_at TEXT, ends_at TEXT, status_override TEXT CHECK(status_override IN ('upcoming','active','ended') OR status_override IS NULL), banner_url TEXT, is_featured INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS event_articles (event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE, sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(event_id,article_id));
CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY AUTOINCREMENT, legacy_id INTEGER UNIQUE, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, content_html TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', published_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS media (id INTEGER PRIMARY KEY AUTOINCREMENT, legacy_id INTEGER UNIQUE, title TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL, local_url TEXT, mime_type TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS comments_archive (id INTEGER PRIMARY KEY AUTOINCREMENT, legacy_id INTEGER UNIQUE, article_legacy_id INTEGER, author_name TEXT, content TEXT, created_at TEXT, approved INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_articles_status_date ON articles(status,published_at DESC);
"""


def txt(node: ET.Element, path: str, default: str = "") -> str:
    value = node.findtext(path, default=default, namespaces=NS)
    return value or default


def slugify(value: str, fallback: str) -> str:
    value = urllib.parse.unquote(value or "").strip().lower().replace("_", "-")
    value = re.sub(r"\s+", "-", value)
    value = re.sub(r"[^\w\-\u3400-\u9fff]+", "", value, flags=re.UNICODE)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or fallback


def unique_slug(connection: sqlite3.Connection, table: str, desired: str, legacy_id: int) -> str:
    base = desired
    candidate = base
    counter = 2
    while connection.execute(f"SELECT 1 FROM {table} WHERE slug=?", (candidate,)).fetchone():
        candidate = f"{base}-{legacy_id or counter}"
        counter += 1
    return candidate


def plain_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


OLD_HOST = re.compile(r"https?://paulshaw\.scusfa\.com/wp-content/uploads/[^\s\"']+", re.I)
IMG_TAG = re.compile(r"<img\b[^>]*>", re.I)
SRC_ATTR = re.compile(r"\bsrc=[\"']([^\"']+)[\"']", re.I)
THUMBS_BLOCK = re.compile(
    r"<pre\b[^>]*>\s*\[thumbs-rating-buttons\]\s*</pre>", re.I
)
THUMBS_SHORTCODE = re.compile(r"\[thumbs-rating-buttons\]", re.I)


def normalize_content(value: str) -> str:
    def replace_image(match: re.Match[str]) -> str:
        tag = match.group(0)
        source = SRC_ATTR.search(tag)
        if not source or not OLD_HOST.match(source.group(1)):
            return tag
        url = source.group(1)
        filename = urllib.parse.unquote(url.rsplit("/", 1)[-1])
        return f'<span class="missing-media" data-original-src="{html.escape(url, quote=True)}">〔旧站图片待恢复：{html.escape(filename)}〕</span>'

    value = THUMBS_BLOCK.sub("", value or "")
    value = THUMBS_SHORTCODE.sub("", value)
    return IMG_TAG.sub(replace_image, value)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("wxr", type=Path)
    parser.add_argument("--database", type=Path, default=Path(os.environ.get("DATABASE_PATH", "data/poxiao.db")))
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()

    if not args.wxr.exists():
        parser.error(f"file not found: {args.wxr}")

    args.database.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(args.database)
    connection.executescript(SCHEMA)

    if args.reset:
        for table in ("event_articles", "article_categories", "comments_archive", "media", "pages", "articles", "events", "categories", "authors"):
            connection.execute(f"DELETE FROM {table}")

    root = ET.parse(args.wxr).getroot()
    channel = root.find("channel")
    if channel is None:
        raise RuntimeError("The WXR channel element is missing")

    site_name = channel.findtext("title") or "破晓"
    settings = {
        "site_name": "破晓",
        "site_tagline": "写作与作品档案",
        "legacy_site_name": site_name,
        "legacy_site_description": channel.findtext("description") or "",
        "legacy_site_url": channel.findtext("link") or "",
        "welcome_text": "欢迎来到破晓。这里保存我们写下的故事，以及它们曾经发生的时刻。",
    }
    for key, value in settings.items():
        connection.execute("INSERT INTO site_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))

    authors_by_login: dict[str, int] = {}
    for node in channel.findall("wp:author", NS):
        legacy_id = int(txt(node, "wp:author_id", "0") or 0)
        login = txt(node, "wp:author_login")
        name = txt(node, "wp:author_display_name") or login or f"作者{legacy_id}"
        desired = slugify(login or name, f"author-{legacy_id}")
        existing = connection.execute("SELECT id,slug FROM authors WHERE legacy_id=?", (legacy_id,)).fetchone()
        if existing:
            author_id = existing[0]
        else:
            slug = unique_slug(connection, "authors", desired, legacy_id)
            author_id = connection.execute(
                "INSERT INTO authors(legacy_id,login,slug,name) VALUES(?,?,?,?)",
                (legacy_id, login or None, slug, name),
            ).lastrowid
        authors_by_login[login] = int(author_id)

    categories_by_nicename: dict[str, tuple[int, int, str, str]] = {}
    event_category_ids: set[int] = set()
    event_keywords = ("活动", "征文", "计划", "特辑")
    for node in channel.findall("wp:category", NS):
        legacy_id = int(txt(node, "wp:term_id", "0") or 0)
        name = txt(node, "wp:cat_name") or f"分类{legacy_id}"
        nicename = txt(node, "wp:category_nicename")
        description = txt(node, "wp:category_description")
        desired = slugify(nicename or name, f"category-{legacy_id}")
        existing = connection.execute("SELECT id,slug FROM categories WHERE legacy_id=?", (legacy_id,)).fetchone()
        if existing:
            category_id, slug = int(existing[0]), existing[1]
        else:
            slug = unique_slug(connection, "categories", desired, legacy_id)
            category_id = int(connection.execute(
                "INSERT INTO categories(legacy_id,slug,name,description) VALUES(?,?,?,?)",
                (legacy_id, slug, name, description),
            ).lastrowid)
        categories_by_nicename[nicename] = (category_id, legacy_id, name, slug)
        if any(keyword in name for keyword in event_keywords):
            event_category_ids.add(legacy_id)
            event_slug = unique_slug(connection, "events", slug, legacy_id)
            connection.execute(
                "INSERT OR IGNORE INTO events(legacy_category_id,slug,title,summary,content_html,status_override) VALUES(?,?,?,?,?,'ended')",
                (legacy_id, event_slug, name, description, description),
            )

    article_categories_by_legacy: dict[int, list[int]] = defaultdict(list)
    stats = defaultdict(int)
    for item in channel.findall("item"):
        post_type = txt(item, "wp:post_type")
        legacy_id = int(txt(item, "wp:post_id", "0") or 0)
        title = item.findtext("title") or f"未命名内容 {legacy_id}"
        raw_slug = txt(item, "wp:post_name")
        published_at = txt(item, "wp:post_date") or None
        if published_at == "0000-00-00 00:00:00":
            published_at = None
        content = normalize_content(txt(item, "content:encoded"))
        status = "published" if txt(item, "wp:status") == "publish" else "draft"

        if post_type == "post":
            existing = connection.execute("SELECT id FROM articles WHERE legacy_id=?", (legacy_id,)).fetchone()
            if existing:
                article_id = int(existing[0])
            else:
                slug = unique_slug(connection, "articles", slugify(raw_slug or title, f"article-{legacy_id}"), legacy_id)
                creator = txt(item, "dc:creator")
                author_id = authors_by_login.get(creator)
                excerpt = txt(item, "excerpt:encoded") or plain_text(content)[:180]
                article_id = int(connection.execute(
                    "INSERT INTO articles(legacy_id,slug,title,excerpt,content_html,author_id,status,published_at,legacy_url) VALUES(?,?,?,?,?,?,?,?,?)",
                    (legacy_id, slug, title, excerpt, content, author_id, status, published_at, item.findtext("link") or None),
                ).lastrowid)
            for category_node in item.findall("category"):
                if category_node.get("domain") != "category":
                    continue
                nicename = category_node.get("nicename") or ""
                category = categories_by_nicename.get(nicename)
                if not category:
                    continue
                category_id, category_legacy_id, _, _ = category
                connection.execute("INSERT OR IGNORE INTO article_categories(article_id,category_id) VALUES(?,?)", (article_id, category_id))
                article_categories_by_legacy[legacy_id].append(category_legacy_id)
                if category_legacy_id in event_category_ids:
                    event = connection.execute("SELECT id FROM events WHERE legacy_category_id=?", (category_legacy_id,)).fetchone()
                    if event:
                        connection.execute("INSERT OR IGNORE INTO event_articles(event_id,article_id) VALUES(?,?)", (event[0], article_id))

            for comment in item.findall("wp:comment", NS):
                comment_id = int(txt(comment, "wp:comment_id", "0") or 0)
                connection.execute(
                    "INSERT OR IGNORE INTO comments_archive(legacy_id,article_legacy_id,author_name,content,created_at,approved) VALUES(?,?,?,?,?,?)",
                    (comment_id, legacy_id, txt(comment, "wp:comment_author"), txt(comment, "wp:comment_content"), txt(comment, "wp:comment_date") or None, 1 if txt(comment, "wp:comment_approved") == "1" else 0),
                )
                stats["comments"] += 1
            stats["articles"] += 1

        elif post_type == "page":
            slug = unique_slug(connection, "pages", slugify(raw_slug or title, f"page-{legacy_id}"), legacy_id)
            connection.execute(
                "INSERT OR IGNORE INTO pages(legacy_id,slug,title,content_html,status,published_at) VALUES(?,?,?,?,?,?)",
                (legacy_id, slug, title, content, status, published_at),
            )
            stats["pages"] += 1

        elif post_type == "attachment":
            source_url = txt(item, "wp:attachment_url")
            if source_url:
                connection.execute(
                    "INSERT OR IGNORE INTO media(legacy_id,title,source_url,mime_type) VALUES(?,?,?,?)",
                    (legacy_id, title, source_url, txt(item, "wp:post_mime_type") or None),
                )
                stats["media"] += 1

    for legacy_category_id in event_category_ids:
        row = connection.execute(
            """SELECT MIN(a.published_at), MAX(a.published_at)
               FROM articles a JOIN event_articles ea ON ea.article_id=a.id
               JOIN events e ON e.id=ea.event_id WHERE e.legacy_category_id=?""",
            (legacy_category_id,),
        ).fetchone()
        if row and row[0]:
            connection.execute("UPDATE events SET starts_at=?, ends_at=? WHERE legacy_category_id=?", (row[0], row[1], legacy_category_id))

    connection.commit()
    totals = {
        "authors": connection.execute("SELECT COUNT(*) FROM authors").fetchone()[0],
        "categories": connection.execute("SELECT COUNT(*) FROM categories").fetchone()[0],
        "articles": connection.execute("SELECT COUNT(*) FROM articles").fetchone()[0],
        "events": connection.execute("SELECT COUNT(*) FROM events").fetchone()[0],
        "pages": connection.execute("SELECT COUNT(*) FROM pages").fetchone()[0],
        "media": connection.execute("SELECT COUNT(*) FROM media").fetchone()[0],
        "comments": connection.execute("SELECT COUNT(*) FROM comments_archive").fetchone()[0],
    }
    print("Imported:", ", ".join(f"{key}={value}" for key, value in totals.items()))
    print(f"Database: {args.database.resolve()}")
    connection.close()
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
