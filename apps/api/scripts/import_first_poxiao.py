"""把“第一届破晓”资料导入当前网站。

原始 DOCX 不会被修改。脚本会：
1. 将参赛稿转换为文章 HTML；
2. 提取文档中的内嵌图片到 public/uploads；
3. 创建科幻、奇幻分类和“第一届破晓”活动；
4. 评议表、对战表和压缩包仍留在原始资料夹，不在活动页公开。

重复运行时，只替换由本脚本导入的第一届破晓文章，不影响后台新建的其他内容。
"""

from __future__ import annotations

import argparse
import html
import posixpath
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

from event_archive_structure import restructure_poxiao_event


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = PROJECT_ROOT / "破晓相关" / "破晓相关" / "1.第一届破晓"
DEFAULT_DATABASE = PROJECT_ROOT / "data" / "poxiao.db"
PUBLIC_ROOT = PROJECT_ROOT / "public" / "uploads" / "events" / "first-poxiao"

WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
VML_NS = "urn:schemas-microsoft-com:vml"

TAG_TEXT = f"{{{WORD_NS}}}t"
TAG_TAB = f"{{{WORD_NS}}}tab"
TAG_BREAK = f"{{{WORD_NS}}}br"
TAG_PARAGRAPH = f"{{{WORD_NS}}}p"
TAG_TABLE = f"{{{WORD_NS}}}tbl"
TAG_TABLE_ROW = f"{{{WORD_NS}}}tr"
TAG_TABLE_CELL = f"{{{WORD_NS}}}tc"
TAG_BLIP = f"{{{DRAWING_NS}}}blip"
TAG_VML_IMAGE = f"{{{VML_NS}}}imagedata"
ATTR_REL_ID = f"{{{REL_NS}}}id"
ATTR_EMBED = f"{{{REL_NS}}}embed"

STAGES = ["第一轮", "第二轮", "第三轮", "第四轮", "半决赛", "终极对决"]
STAGE_SLUG = {
    "第一轮": "round-1",
    "第二轮": "round-2",
    "第三轮": "round-3",
    "第四轮": "round-4",
    "半决赛": "semifinal",
    "终极对决": "final",
}
CHINESE_NUMBER = {
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
    "十": 10,
}


@dataclass(frozen=True)
class WorkInfo:
    source: Path
    track: str
    track_slug: str
    stage: str
    group: str | None
    entry_code: str | None
    final_number: int | None
    title: str
    slug: str
    sort_order: int


def parse_work(path: Path) -> WorkInfo | None:
    """从统一的原始文件名中解析题材、轮次、编号和作品名。"""

    name = path.name
    if path.suffix.lower() != ".docx" or name.startswith("第一届“破晓”"):
        return None

    track = "科幻" if name.startswith("科幻组") else "奇幻" if name.startswith("奇幻组") else ""
    if not track:
        return None

    stage = next((item for item in STAGES if item in name), "")
    title_match = re.search(r"《(.+?)》", name)
    if not stage or not title_match:
        raise ValueError(f"无法解析作品文件名：{name}")

    group_match = re.search(r"第([一二三四五六七八九十]+)组", name)
    code_match = re.search(r"([AaBb]\d+)", name)
    final_match = re.search(r"第([一二三四五六七八九十]+)篇", name)

    group = group_match.group(0) if group_match else None
    entry_code = code_match.group(1).upper() if code_match else None
    final_number = CHINESE_NUMBER.get(final_match.group(1)) if final_match else None
    track_slug = "science-fiction" if track == "科幻" else "fantasy"
    group_number = CHINESE_NUMBER.get(group_match.group(1), 0) if group_match else 0
    if entry_code:
        identity = f"group-{group_number}-{entry_code.lower()}"
    else:
        identity = f"entry-{final_number or 1}"
    slug = f"first-poxiao-{track_slug}-{STAGE_SLUG[stage]}-{identity}"

    stage_index = STAGES.index(stage)
    entry_number = int(re.search(r"\d+", entry_code).group()) if entry_code else final_number or 0
    track_offset = 0 if track == "科幻" else 1000
    sort_order = track_offset + stage_index * 100 + group_number * 10 + entry_number

    return WorkInfo(
        source=path,
        track=track,
        track_slug=track_slug,
        stage=stage,
        group=group,
        entry_code=entry_code,
        final_number=final_number,
        title=title_match.group(1),
        slug=slug,
        sort_order=sort_order,
    )


def relationship_targets(archive: ZipFile) -> dict[str, str]:
    root = ET.fromstring(archive.read("word/_rels/document.xml.rels"))
    return {
        item.attrib["Id"]: item.attrib["Target"]
        for item in root.findall(f"{{{PACKAGE_REL_NS}}}Relationship")
        if item.attrib.get("TargetMode") != "External"
    }


def archive_media_path(target: str) -> str:
    return posixpath.normpath(posixpath.join("word", target))


def paragraph_parts(
    paragraph: ET.Element,
    archive: ZipFile,
    relationships: dict[str, str],
    work: WorkInfo,
    image_counter: list[int],
) -> tuple[str, list[str]]:
    """按 Word 段落中的原始顺序提取文字和图片。"""

    parts: list[str] = []
    plain_text: list[str] = []

    for node in paragraph.iter():
        if node.tag == TAG_TEXT and node.text:
            parts.append(html.escape(node.text))
            plain_text.append(node.text)
        elif node.tag == TAG_TAB:
            parts.append("　　")
            plain_text.append("　　")
        elif node.tag == TAG_BREAK:
            parts.append("<br>")
            plain_text.append("\n")
        elif node.tag in {TAG_BLIP, TAG_VML_IMAGE}:
            relation_id = node.attrib.get(ATTR_EMBED) or node.attrib.get(ATTR_REL_ID)
            if not relation_id or relation_id not in relationships:
                continue

            internal_path = archive_media_path(relationships[relation_id])
            if internal_path not in archive.namelist():
                continue

            image_counter[0] += 1
            suffix = Path(internal_path).suffix.lower() or ".jpg"
            image_name = f"image-{image_counter[0]:02d}{suffix}"
            output_dir = PUBLIC_ROOT / "articles" / work.slug
            output_dir.mkdir(parents=True, exist_ok=True)
            (output_dir / image_name).write_bytes(archive.read(internal_path))

            public_url = f"/uploads/events/first-poxiao/articles/{work.slug}/{image_name}"
            parts.append(
                f'<img src="{html.escape(public_url)}" alt="{html.escape(work.title)}配图">'
            )

    return "".join(parts).strip(), plain_text


def table_html(table: ET.Element) -> str:
    rows: list[str] = []
    for row in table.findall(f".//{TAG_TABLE_ROW}"):
        cells: list[str] = []
        for cell in row.findall(f"./{TAG_TABLE_CELL}"):
            text = "".join(node.text or "" for node in cell.iter(TAG_TEXT)).strip()
            cells.append(f"<td>{html.escape(text)}</td>")
        if cells:
            rows.append(f"<tr>{''.join(cells)}</tr>")
    return f"<table><tbody>{''.join(rows)}</tbody></table>" if rows else ""


def convert_docx(work: WorkInfo) -> tuple[str, str, str | None, int]:
    """返回 HTML、纯文本摘要、关键词和提取图片数。"""

    with ZipFile(work.source) as archive:
        document = ET.fromstring(archive.read("word/document.xml"))
        body = document.find(f".//{{{WORD_NS}}}body")
        if body is None:
            raise ValueError(f"文档没有正文：{work.source.name}")

        relationships = relationship_targets(archive)
        blocks: list[str] = []
        plain_paragraphs: list[str] = []
        keyword: str | None = None
        image_counter = [0]
        paragraph_index = 0

        for child in body:
            if child.tag == TAG_PARAGRAPH:
                content, plain_parts = paragraph_parts(
                    child,
                    archive,
                    relationships,
                    work,
                    image_counter,
                )
                plain = "".join(plain_parts).strip()
                if not content:
                    continue

                # 文档第一行通常与文件名重复，网页标题已单独展示。
                # 《红楼梦》的标题和全部配图位于同一个 Word 段落，
                # 因此只能移除标题文字，不能直接跳过整个段落。
                if paragraph_index == 0 and work.title in plain:
                    content = content.replace(html.escape(plain), "", 1).strip()
                    plain = ""
                    paragraph_index += 1
                    if not content:
                        continue
                paragraph_index += 1

                if plain.startswith("关键词"):
                    keyword = plain.split("：", 1)[-1].strip() if "：" in plain else plain
                    continue

                if plain:
                    plain_paragraphs.append(plain)
                if content.startswith("<img") and plain == "":
                    blocks.append(f"<figure>{content}</figure>")
                else:
                    blocks.append(f"<p>{content}</p>")
            elif child.tag == TAG_TABLE:
                rendered = table_html(child)
                if rendered:
                    blocks.append(rendered)

    body_html = "".join(blocks)
    plain_text = " ".join(plain_paragraphs)
    return body_html, plain_text, keyword, image_counter[0]


def upsert_category(connection: sqlite3.Connection, slug: str, name: str, description: str) -> int:
    connection.execute(
        """
        INSERT INTO categories (slug, name, description)
        VALUES (?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET name=excluded.name, description=excluded.description
        """,
        (slug, name, description),
    )
    return int(connection.execute("SELECT id FROM categories WHERE slug=?", (slug,)).fetchone()[0])


def import_event(source: Path, database_path: Path) -> dict[str, int]:
    if not source.is_dir():
        raise FileNotFoundError(f"找不到资料目录：{source}")
    if not database_path.is_file():
        raise FileNotFoundError(f"找不到网站数据库：{database_path}")

    works = [work for path in sorted(source.glob("*.docx")) if (work := parse_work(path))]
    if len(works) != 56:
        raise ValueError(f"预期 56 篇作品，实际解析到 {len(works)} 篇")
    slugs = [work.slug for work in works]
    if len(slugs) != len(set(slugs)):
        raise ValueError("作品网址标识存在重复，请检查文件名解析规则")

    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)

    converted: list[tuple[WorkInfo, str, str, int]] = []
    image_total = 0
    for work in works:
        content_html, plain_text, _keyword, image_count = convert_docx(work)
        image_total += image_count
        excerpt = f"第一届破晓 · {work.track}组 · {work.stage}"
        if work.group:
            excerpt += f" · {work.group}"
        if work.entry_code:
            excerpt += f" · {work.entry_code}"
        if plain_text:
            excerpt += "｜" + re.sub(r"\s+", " ", plain_text)[:120]
        converted.append((work, content_html, excerpt, image_count))

    connection = sqlite3.connect(database_path)
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        with connection:
            # 仅清理本脚本之前导入的文章，保护后台手工添加的内容。
            connection.execute("DELETE FROM articles WHERE legacy_url LIKE 'local:first-poxiao/%'")

            category_ids = {
                "科幻": upsert_category(
                    connection,
                    "science-fiction",
                    "科幻",
                    "第一届破晓科幻组及其他科幻作品。",
                ),
                "奇幻": upsert_category(
                    connection,
                    "fantasy",
                    "奇幻",
                    "第一届破晓奇幻组及其他奇幻作品。",
                ),
            }

            event_values = (
                "第一届破晓",
                "第一届“破晓”写作活动，收录科幻组与奇幻组的多轮对决作品。",
                "",
                "ended",
                None,
            )
            connection.execute(
                """
                INSERT INTO events (
                  slug, title, event_group, summary, content_html, status_override, banner_url, is_featured
                ) VALUES ('first-poxiao', ?, 'poxiao', ?, ?, ?, ?, 1)
                ON CONFLICT(slug) DO UPDATE SET
                  title=excluded.title,
                  summary=excluded.summary,
                  content_html=excluded.content_html,
                  status_override=excluded.status_override,
                  banner_url=excluded.banner_url,
                  is_featured=excluded.is_featured,
                  updated_at=CURRENT_TIMESTAMP
                """,
                event_values,
            )
            event_id = int(
                connection.execute("SELECT id FROM events WHERE slug='first-poxiao'").fetchone()[0]
            )

            for work, content_html, excerpt, _image_count in converted:
                published_at = datetime.fromtimestamp(work.source.stat().st_mtime).strftime(
                    "%Y-%m-%d %H:%M:%S"
                )
                cursor = connection.execute(
                    """
                    INSERT INTO articles (
                      slug, title, excerpt, content_html, status, published_at,
                      is_pinned, legacy_url
                    ) VALUES (?, ?, ?, ?, 'published', ?, 0, ?)
                    """,
                    (
                        work.slug,
                        work.title,
                        excerpt,
                        content_html,
                        published_at,
                        f"local:first-poxiao/{work.source.name}",
                    ),
                )
                article_id = int(cursor.lastrowid)
                connection.execute(
                    "INSERT INTO article_categories(article_id, category_id) VALUES (?, ?)",
                    (article_id, category_ids[work.track]),
                )
                connection.execute(
                    """
                    INSERT INTO event_articles(
                      event_id, article_id, section_path, sort_order
                    ) VALUES (?, ?, ?, ?)
                    """,
                    (event_id, article_id, f"{work.track}组 / {work.stage}", work.sort_order),
                )
            restructure_poxiao_event(connection, event_id)
    finally:
        connection.close()

    return {"works": len(works), "images": image_total, "events": 1, "categories": 2}


def main() -> None:
    parser = argparse.ArgumentParser(description="导入第一届破晓活动和参赛作品")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE)
    args = parser.parse_args()

    result = import_event(args.source.resolve(), args.database.resolve())
    print(
        f"导入完成：活动 {result['events']} 个，分类 {result['categories']} 个，"
        f"作品 {result['works']} 篇，提取图片 {result['images']} 张。"
    )


if __name__ == "__main__":
    main()
