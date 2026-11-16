"""整理并导入第二届至第九届破晓及同期写作活动。

原则：
- 原始资料只读，不修改源文件；
- 比赛评议表、统计表等管理资料不作为作品导入；
- DOCX 保留正文、表格和内嵌图片；DOC/RTF 先通过本机 Word 转为 DOCX；
- PDF/TXT 提取可读文字，不在文章末尾附原始文档下载链接；
- 网址标识由原始相对路径生成，重复运行会更新文章而不删除评论。
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import posixpath
import re
import sqlite3
import subprocess
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from zipfile import BadZipFile, ZipFile
from xml.etree import ElementTree as ET

from event_archive_structure import restructure_poxiao_event

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover - 运行环境检查会给出明确错误
    PdfReader = None  # type: ignore[assignment]


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_ROOT = PROJECT_ROOT / "破晓相关" / "破晓相关"
DATABASE_PATH = PROJECT_ROOT / "data" / "poxiao.db"
PUBLIC_ROOT = PROJECT_ROOT / "public" / "uploads" / "events" / "archive-import"
CACHE_ROOT = PROJECT_ROOT / "data" / "import_cache" / "legacy-docx"
REPORT_JSON = PROJECT_ROOT / "data" / "remaining_activities_import_report.json"
REPORT_MD = PROJECT_ROOT / "破晓相关" / "整理输出" / "其余活动-导入报告.md"

SUPPORTED_SUFFIXES = {".docx", ".doc", ".rtf", ".pdf", ".txt"}
LEGACY_SUFFIXES = {".doc", ".rtf"}
ADMIN_MARKERS = (
    "评议表",
    "评议结果",
    "评审意见",
    "编辑评议",
    "编辑评价",
    "评委点评",
    "统计",
    "通过表",
    "决赛名单",
    "猜作者",
    "颁奖表",
    "活动表",
    "条目表",
    "作品编号表",
    "关键词投票",
)

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


@dataclass(frozen=True)
class SourceGroup:
    relative_dir: str
    section: str = ""
    classify_filename: bool = False
    recursive: bool = True
    filename_contains: str | None = None
    filename_excludes: str | None = None


@dataclass(frozen=True)
class EventSpec:
    slug: str
    title: str
    summary: str
    starts_at: str | None
    ends_at: str | None
    sources: tuple[SourceGroup, ...]
    legacy_slug_prefix: str | None = None
    article_date_base: str | None = None
    sort_order: int = 0


@dataclass(frozen=True)
class Work:
    event: EventSpec
    source: Path
    archive_relative: str
    section: str
    title: str
    slug: str
    sort_order: int


def groups(*items: tuple[str, str]) -> tuple[SourceGroup, ...]:
    return tuple(SourceGroup(path, section) for path, section in items)


EVENTS: tuple[EventSpec, ...] = (
    EventSpec(
        "second-poxiao",
        "第二届破晓",
        "第二届“破晓”写作活动，收录科幻组、奇幻组与友谊赛作品。",
        "2019-01-01 00:00:00",
        "2019-12-31 23:59:59",
        (SourceGroup("2.第二届破晓", classify_filename=True, filename_excludes="夏活"),),
    ),
    EventSpec(
        "summer-2019",
        "2019夏活",
        "从第二届破晓资料中独立整理的 SCU-SFA 写作组夏活作品。",
        None,  # 原始文档没有可靠的活动起止月份。
        None,
        (SourceGroup("2.第二届破晓", filename_contains="夏活"),),
        legacy_slug_prefix="second-poxiao",  # 保留已有文章网址和原文资源路径。
        article_date_base="2019-01-01 00:00:00",
        sort_order=245,
    ),
    EventSpec(
        "third-poxiao",
        "第三届破晓",
        "第三届“破晓”写作活动，按组别与轮次整理参赛作品。",
        "2020-01-01 00:00:00",
        "2020-12-31 23:59:59",
        groups(
            ("3.第三届破晓/科幻组预赛", "科幻组 / 预赛"),
            ("3.第三届破晓/科幻组第一轮", "科幻组 / 第一轮"),
            ("3.第三届破晓/科幻组第二轮", "科幻组 / 第二轮"),
            ("3.第三届破晓/科幻组第三轮", "科幻组 / 第三轮"),
            ("3.第三届破晓/科幻组决赛", "科幻组 / 决赛"),
            ("3.第三届破晓/奇幻组预赛", "奇幻组 / 预赛"),
            ("3.第三届破晓/奇幻组第一轮", "奇幻组 / 第一轮"),
            ("3.第三届破晓/奇幻组第二轮", "奇幻组 / 第二轮"),
            ("3.第三届破晓/奇幻组第三轮", "奇幻组 / 第三轮"),
            ("3.第三届破晓/奇幻组决赛", "奇幻组 / 决赛"),
            ("3.第三届破晓/友谊赛", "友谊赛"),
        ),
    ),
    EventSpec(
        "winter-2020",
        "2020冬季写作活动",
        "破晓写作组2020年冬季写作活动作品集。",
        "2020-12-01 00:00:00",
        "2021-02-28 23:59:59",
        groups(("3.第三届破晓/2020冬活", "")),
    ),
    EventSpec(
        "fourth-poxiao",
        "第四届破晓",
        "第四届“破晓”写作活动，收录预赛、正赛、决赛、友谊赛与外场作品。",
        "2021-01-01 00:00:00",
        "2021-12-31 23:59:59",
        groups(
            ("4.第四届破晓/第四届破晓预赛", "预赛"),
            ("4.第四届破晓/第四届破晓第一轮", "第一轮"),
            ("4.第四届破晓/第四届破晓第二轮", "第二轮"),
            ("4.第四届破晓/第四届破晓决赛", "决赛"),
            ("4.第四届破晓/第四届破晓友谊赛", "友谊赛"),
            ("4.第四届破晓/外场", "外场"),
        ),
    ),
    EventSpec(
        "summer-2020",
        "2020夏季写作活动",
        "破晓写作组夏季活动作品集，活动名称沿用原始资料夹。",
        "2020-06-01 00:00:00",
        "2020-09-30 23:59:59",
        groups(("4.第四届破晓/2020夏活", "")),
    ),
    EventSpec(
        "winter-2021",
        "2021冬季写作活动",
        "破晓写作组2021年冬季交换写作活动，整理改写稿与原稿。",
        "2021-12-01 00:00:00",
        "2022-02-28 23:59:59",
        (
            SourceGroup("4.第四届破晓/2021冬活", "改写稿", recursive=False),
            SourceGroup("4.第四届破晓/2021冬活/冬活原稿", "原稿"),
        ),
    ),
    EventSpec(
        "summer-2021",
        "2021夏季写作活动",
        "破晓写作组2021年夏季写作活动作品集。",
        "2021-06-01 00:00:00",
        "2021-09-30 23:59:59",
        groups(("4.第四届破晓/2021夏活（石墨，大甲虫）", "")),
    ),
    EventSpec(
        "person-month-project",
        "人月计划",
        "“人月计划”写作活动作品集。",
        "2021-01-01 00:00:00",
        "2021-12-31 23:59:59",
        groups(("4.第四届破晓/人月计划（安提）", "")),
    ),
    EventSpec(
        "fifth-poxiao",
        "第五届破晓",
        "第五届“破晓”写作活动，收录科幻组、奇幻组、友谊赛与外场作品。",
        "2022-01-01 00:00:00",
        "2022-12-31 23:59:59",
        groups(
            ("5.第五届破晓/第五届破晓第一轮科幻组", "科幻组 / 第一轮"),
            ("5.第五届破晓/第五届破晓第一轮奇幻组", "奇幻组 / 第一轮"),
            ("5.第五届破晓/第五届破晓第二轮", "第二轮"),
            ("5.第五届破晓/第五届破晓决赛科幻组", "科幻组 / 决赛"),
            ("5.第五届破晓/第五届破晓决赛奇幻组", "奇幻组 / 决赛"),
            ("5.第五届破晓/第五届破晓决赛友谊赛", "友谊赛 / 决赛"),
            ("5.第五届破晓/外场稿件合集", "外场"),
        ),
    ),
    EventSpec(
        "winter-2022",
        "2022冬季写作活动",
        "破晓写作组2022年冬季交换写作活动，分别保存原稿与改写稿。",
        "2022-12-01 00:00:00",
        "2023-02-28 23:59:59",
        groups(
            ("5.第五届破晓/2022写作组冬活原稿", "原稿"),
            ("5.第五届破晓/2022年冬季活动", "改写稿"),
        ),
    ),
    EventSpec(
        "fiction-writing-2022",
        "2022虚构写作活动",
        "2022年虚构写作活动作品集。",
        "2022-01-01 00:00:00",
        "2022-12-31 23:59:59",
        groups(("5.第五届破晓/2022年虚构写作活动", "")),
    ),
    EventSpec(
        "comfort-zone-breaker-2022",
        "2022舒适圈破壁机",
        "“舒适圈破壁机”主题写作活动作品集。",
        "2022-01-01 00:00:00",
        "2022-12-31 23:59:59",
        groups(("5.第五届破晓/2022舒适圈破壁机", "")),
    ),
    EventSpec(
        "sixth-poxiao",
        "第六届破晓",
        "第六届“破晓”写作活动，按组别与轮次整理参赛作品。",
        "2023-01-01 00:00:00",
        "2023-12-31 23:59:59",
        groups(
            ("6.第六届破晓/第六届破晓第一轮科幻组", "科幻组 / 第一轮"),
            ("6.第六届破晓/第六届破晓一轮奇幻组", "奇幻组 / 第一轮"),
            ("6.第六届破晓/第六届破晓第二轮科幻组", "科幻组 / 第二轮"),
            ("6.第六届破晓/第六届破晓第二轮奇幻组", "奇幻组 / 第二轮"),
            ("6.第六届破晓/第六届破晓决赛科幻组", "科幻组 / 决赛"),
            ("6.第六届破晓/第六届破晓决赛奇幻组", "奇幻组 / 决赛"),
            ("6.第六届破晓/第六届破晓决赛友谊赛", "友谊赛 / 决赛"),
        ),
    ),
    EventSpec(
        "winter-2023",
        "2023冬季写作活动",
        "破晓写作组2023年冬季写作活动作品集。",
        "2023-12-01 00:00:00",
        "2024-02-29 23:59:59",
        groups(("6.第六届破晓/2023年冬季活动", "")),
    ),
    EventSpec(
        "summer-2023",
        "2023夏季写作活动",
        "破晓写作组2023年夏季写作活动作品集。",
        "2023-06-01 00:00:00",
        "2023-09-30 23:59:59",
        groups(("6.第六届破晓/2023年夏季活动", "")),
    ),
    EventSpec(
        "mid-autumn-2023",
        "2023中秋写作活动",
        "破晓写作组中秋主题写作活动作品集。",
        "2023-09-01 00:00:00",
        "2023-10-31 23:59:59",
        groups(("6.第六届破晓/中秋活动", "")),
    ),
    EventSpec(
        "seventh-poxiao",
        "第七届破晓",
        "第七届“破晓”写作活动，收录两轮比赛、决赛与外场作品。",
        "2024-01-01 00:00:00",
        "2024-12-31 23:59:59",
        groups(
            ("7.第七届破晓/第七届破晓-一轮-科幻组", "科幻组 / 第一轮"),
            ("7.第七届破晓/第七届破晓-一轮奇幻组", "奇幻组 / 第一轮"),
            ("7.第七届破晓/第七届破晓二轮科幻", "科幻组 / 第二轮"),
            ("7.第七届破晓/第七届破晓二轮奇幻", "奇幻组 / 第二轮"),
            ("7.第七届破晓/第七届破晓决赛科幻", "科幻组 / 决赛"),
            ("7.第七届破晓/第七届破晓决赛奇幻", "奇幻组 / 决赛"),
            ("7.第七届破晓/第七届破晓外场", "外场"),
        ),
    ),
    EventSpec(
        "winter-2024",
        "2024冬季写作活动",
        "破晓写作组2024年冬季交换写作活动，分别保存原稿与改写稿。",
        "2024-12-01 00:00:00",
        "2025-02-28 23:59:59",
        groups(
            ("7.第七届破晓/2024冬活原稿", "原稿"),
            ("7.第七届破晓/2024冬活改写后稿", "改写稿"),
        ),
    ),
    EventSpec(
        "summer-2024-sandbox",
        "2024夏季沙盒写作活动",
        "破晓写作组2024年夏季沙盒写作活动作品集。",
        "2024-06-01 00:00:00",
        "2024-09-30 23:59:59",
        groups(("7.第七届破晓/2024夏活-沙盒活动", "")),
    ),
    EventSpec(
        "eighth-poxiao",
        "第八届破晓",
        "第八届“破晓”写作活动，收录科幻组、奇幻组与第二轮作品。",
        "2025-01-01 00:00:00",
        "2025-12-31 23:59:59",
        groups(
            ("8.第八届破晓/八届破晓一轮科幻", "科幻组 / 第一轮"),
            ("8.第八届破晓/八届破晓一轮奇幻", "奇幻组 / 第一轮"),
            ("8.第八届破晓/第二轮", "第二轮"),
        ),
    ),
    EventSpec(
        "winter-2025",
        "2025冬季写作活动",
        "破晓写作组2025年冬季交换写作活动，分别保存原稿与交换稿。",
        "2025-12-01 00:00:00",
        "2026-02-28 23:59:59",
        groups(
            ("8.第八届破晓/2025冬活原文", "原稿"),
            ("8.第八届破晓/2025冬活交换稿", "交换稿"),
        ),
    ),
    EventSpec(
        "summer-2025",
        "2025夏季写作活动",
        "破晓写作组2025年夏季写作活动作品集。",
        "2025-06-01 00:00:00",
        "2025-09-30 23:59:59",
        groups(("8.第八届破晓/2025夏活", "")),
    ),
    EventSpec(
        "ninth-poxiao",
        "第九届破晓",
        "第九届“破晓”写作活动，收录两轮比赛、决赛与外场作品。",
        "2026-01-01 00:00:00",
        "2026-08-31 23:59:59",
        groups(
            ("9.第九届破晓/九届破晓一轮科幻", "科幻组 / 第一轮"),
            ("9.第九届破晓/九届破晓一轮奇幻", "奇幻组 / 第一轮"),
            ("9.第九届破晓/九届破晓一轮外场", "外场 / 第一轮"),
            ("9.第九届破晓/九届破晓二轮科幻", "科幻组 / 第二轮"),
            ("9.第九届破晓/九届破晓二轮奇幻", "奇幻组 / 第二轮"),
            ("9.第九届破晓/九届破晓二轮外场", "外场 / 第二轮"),
            ("9.第九届破晓/九届破晓决赛", "决赛"),
            ("9.第九届破晓/九届破晓决赛外场", "外场 / 决赛"),
        ),
    ),
    EventSpec(
        "winter-2026-isekai",
        "2026冬日活动：异世界转生",
        "破晓写作组2026年冬日“异世界转生”主题活动作品集。",
        "2026-01-01 00:00:00",
        "2026-03-31 23:59:59",
        groups(("9.第九届破晓/2026冬日活动-异世界转生", "")),
    ),
    EventSpec(
        "summer-2026-fusion",
        "2026夏日活动：融合写作",
        "破晓写作组2026年夏日“融合写作”活动作品集。",
        "2026-06-01 00:00:00",
        "2026-09-30 23:59:59",
        groups(("9.第九届破晓/2026夏日活动-融合写作/作品", "")),
    ),
)


def should_skip(path: Path) -> str | None:
    if path.name.startswith("~$"):
        return "Office 临时文件"
    if path.suffix.lower() not in SUPPORTED_SUFFIXES:
        return "非正文格式"
    if any(marker in path.stem for marker in ADMIN_MARKERS):
        return "评议、统计或活动管理资料"
    if path.stem.strip() == "2024夏活 沙盒":
        return "活动说明文件"
    return None


def title_from_filename(path: Path) -> str:
    stem = path.stem.strip()
    quoted = [item.strip() for item in re.findall(r"《([^》]+)》", stem) if item.strip()]
    if quoted:
        return " / ".join(dict.fromkeys(quoted))

    stem = re.sub(r"^[【\[].+?[】\]]\s*", "", stem)
    stem = re.sub(r"^[A-Za-zＡ-Ｚａ-ｚ]?\d+[\s._-]*", "", stem)
    stem = re.sub(r"[（(]\s*\d+\s*字\s*[）)]", "", stem)
    stem = re.sub(r"【\s*\d+\s*】", "", stem)
    stem = re.sub(r"\s*[（(]\d+[）)]$", "", stem)
    return stem.strip(" _-—") or "未命名作品"


def classify_second_event(path: Path) -> str:
    tag_match = re.search(r"【([^】]+)】", path.stem)
    if tag_match:
        label = tag_match.group(1)
        if label.startswith("科幻组"):
            stage = label.removeprefix("科幻组") or "赛程未标明"
            return f"科幻组 / {stage}"
        if label.startswith("奇幻组"):
            stage = label.removeprefix("奇幻组") or "赛程未标明"
            return f"奇幻组 / {stage}"
        return label
    if "夏活" in path.stem:
        return "同期夏季活动"
    return "其他作品"


def normalize_section(base: str, nested_parts: tuple[str, ...]) -> str:
    parts = [item.strip() for item in base.split("/") if item.strip()]
    for nested in nested_parts:
        item = nested.strip()
        if not item:
            continue
        if any(marker in item and marker in base for marker in ("原稿", "改写稿", "交换稿")):
            continue
        parts.append(item)
    parts = list(dict.fromkeys(parts))

    track_index = next(
        (index for index, item in enumerate(parts) if item in {"科幻组", "奇幻组"}),
        None,
    )
    if track_index is not None and track_index > 0:
        parts.insert(0, parts.pop(track_index))
    return " / ".join(parts)


def gather_works() -> tuple[list[Work], list[dict[str, str]]]:
    works: list[Work] = []
    skipped: list[dict[str, str]] = []

    for event in EVENTS:
        event_index = 0
        for source_group in event.sources:
            source_root = ARCHIVE_ROOT / source_group.relative_dir
            if not source_root.is_dir():
                raise FileNotFoundError(f"找不到活动资料夹：{source_root}")

            candidates = source_root.rglob("*") if source_group.recursive else source_root.glob("*")
            for source in sorted(candidates, key=lambda item: item.as_posix().lower()):
                if not source.is_file():
                    continue
                if source_group.filename_contains and source_group.filename_contains not in source.stem:
                    continue
                if source_group.filename_excludes and source_group.filename_excludes in source.stem:
                    continue
                reason = should_skip(source)
                if reason:
                    if source.suffix.lower() in SUPPORTED_SUFFIXES or source.name.startswith("~$"):
                        skipped.append({"path": str(source.relative_to(ARCHIVE_ROOT)), "reason": reason})
                    continue

                event_index += 1
                inside = source.relative_to(source_root)
                if source_group.classify_filename:
                    section = classify_second_event(source)
                else:
                    section = normalize_section(source_group.section, inside.parent.parts)
                archive_relative = source.relative_to(ARCHIVE_ROOT).as_posix()
                digest = hashlib.sha1(archive_relative.encode("utf-8")).hexdigest()[:12]
                works.append(
                    Work(
                        event=event,
                        source=source,
                        archive_relative=archive_relative,
                        section=section,
                        title=title_from_filename(source),
                        slug=f"{event.legacy_slug_prefix or event.slug}-{digest}",
                        sort_order=event_index,
                    )
                )

    return works, skipped


def prepare_legacy_documents(works: list[Work]) -> tuple[dict[Path, Path], list[str]]:
    legacy = [work for work in works if work.source.suffix.lower() in LEGACY_SUFFIXES]
    if not legacy:
        return {}, []

    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    mapping: dict[Path, Path] = {}
    manifest: list[dict[str, str]] = []
    for work in legacy:
        digest = hashlib.sha1(work.archive_relative.encode("utf-8")).hexdigest()[:16]
        output = CACHE_ROOT / f"{digest}.docx"
        mapping[work.source] = output
        if not output.is_file() or output.stat().st_mtime < work.source.stat().st_mtime:
            manifest.append({"input": str(work.source.resolve()), "output": str(output.resolve())})

    if not manifest:
        return mapping, [f"旧版 Word 转换缓存命中：{len(mapping)} 份"]

    manifest_path = CACHE_ROOT / "conversion-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    powershell = Path(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe")
    helper = PROJECT_ROOT / "scripts" / "convert_legacy_word.ps1"
    result = subprocess.run(
        [str(powershell), "-NoProfile", "-File", str(helper), "-ManifestPath", str(manifest_path)],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=600,
        check=False,
    )
    messages = [line for line in (result.stdout + "\n" + result.stderr).splitlines() if line.strip()]
    if result.returncode != 0:
        messages.append(f"Word 批量转换进程退出码：{result.returncode}")
    return mapping, messages


def relationship_targets(archive: ZipFile) -> dict[str, str]:
    relationships_path = "word/_rels/document.xml.rels"
    if relationships_path not in archive.namelist():
        return {}
    root = ET.fromstring(archive.read(relationships_path))
    return {
        item.attrib["Id"]: item.attrib["Target"]
        for item in root.findall(f"{{{PACKAGE_REL_NS}}}Relationship")
        if item.attrib.get("TargetMode") != "External"
    }


def paragraph_html(
    paragraph: ET.Element,
    archive: ZipFile,
    relationships: dict[str, str],
    output_dir: Path,
    public_base: str,
    title: str,
    image_counter: list[int],
) -> tuple[str, str]:
    parts: list[str] = []
    plain_parts: list[str] = []
    for node in paragraph.iter():
        if node.tag == TAG_TEXT and node.text:
            parts.append(html.escape(node.text))
            plain_parts.append(node.text)
        elif node.tag == TAG_TAB:
            parts.append("　　")
            plain_parts.append("　　")
        elif node.tag == TAG_BREAK:
            parts.append("<br>")
            plain_parts.append("\n")
        elif node.tag in {TAG_BLIP, TAG_VML_IMAGE}:
            relation_id = node.attrib.get(ATTR_EMBED) or node.attrib.get(ATTR_REL_ID)
            target = relationships.get(relation_id or "")
            if not target:
                continue
            internal_path = posixpath.normpath(posixpath.join("word", target))
            if internal_path not in archive.namelist():
                continue
            image_counter[0] += 1
            suffix = Path(internal_path).suffix.lower() or ".jpg"
            image_name = f"image-{image_counter[0]:03d}{suffix}"
            (output_dir / image_name).write_bytes(archive.read(internal_path))
            parts.append(
                f'<img src="{html.escape(public_base)}/{image_name}" '
                f'alt="{html.escape(title)}配图">'
            )
    return "".join(parts).strip(), "".join(plain_parts).strip()


def table_html(table: ET.Element) -> tuple[str, str]:
    rendered_rows: list[str] = []
    plain_rows: list[str] = []
    for row in table.findall(f".//{TAG_TABLE_ROW}"):
        cells: list[str] = []
        plain_cells: list[str] = []
        for cell in row.findall(f"./{TAG_TABLE_CELL}"):
            text = "".join(node.text or "" for node in cell.iter(TAG_TEXT)).strip()
            cells.append(f"<td>{html.escape(text)}</td>")
            plain_cells.append(text)
        if cells:
            rendered_rows.append(f"<tr>{''.join(cells)}</tr>")
            plain_rows.append(" | ".join(plain_cells))
    rendered = f"<table><tbody>{''.join(rendered_rows)}</tbody></table>" if rendered_rows else ""
    return rendered, " ".join(plain_rows)


def convert_docx(
    source: Path,
    output_dir: Path,
    public_base: str,
    title: str,
) -> tuple[str, str, int]:
    with ZipFile(source) as archive:
        document = ET.fromstring(archive.read("word/document.xml"))
        body = document.find(f".//{{{WORD_NS}}}body")
        if body is None:
            raise ValueError("Word 文档没有正文")
        relationships = relationship_targets(archive)
        blocks: list[str] = []
        plain_blocks: list[str] = []
        image_counter = [0]
        text_paragraph_index = 0

        for child in body:
            if child.tag == TAG_PARAGRAPH:
                rendered, plain = paragraph_html(
                    child,
                    archive,
                    relationships,
                    output_dir,
                    public_base,
                    title,
                    image_counter,
                )
                if not rendered:
                    continue
                is_first_text_paragraph = text_paragraph_index == 0 and bool(plain)
                if plain:
                    text_paragraph_index += 1
                if (
                    is_first_text_paragraph
                    and len(plain) <= 160
                    and (title in plain or plain.strip("《》 ") == title.strip("《》 "))
                ):
                    rendered = rendered.replace(html.escape(plain), "", 1).strip()
                    plain = ""
                if plain:
                    plain_blocks.append(plain)
                if rendered:
                    blocks.append(
                        f"<figure>{rendered}</figure>"
                        if rendered.startswith("<img") and not plain
                        else f"<p>{rendered}</p>"
                    )
            elif child.tag == TAG_TABLE:
                rendered, plain = table_html(child)
                if rendered:
                    blocks.append(rendered)
                if plain:
                    plain_blocks.append(plain)

    return "".join(blocks), " ".join(plain_blocks), image_counter[0]


def read_text_file(source: Path) -> str:
    data = source.read_bytes()
    for encoding in ("utf-8-sig", "utf-16", "gb18030", "big5"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def text_to_html(text: str) -> tuple[str, str]:
    paragraphs = [item.strip() for item in re.split(r"\n\s*\n", text.replace("\r\n", "\n"))]
    paragraphs = [item for item in paragraphs if item]
    rendered = "".join(f"<p>{html.escape(item).replace(chr(10), '<br>')}</p>" for item in paragraphs)
    return rendered, " ".join(paragraphs)


def convert_pdf(source: Path) -> tuple[str, str]:
    if PdfReader is None:
        raise RuntimeError("当前 Python 环境缺少 pypdf，无法提取 PDF 文字")
    reader = PdfReader(str(source))
    pages = [(page.extract_text() or "").strip() for page in reader.pages]
    text = "\n\n".join(page for page in pages if page)
    return text_to_html(text)


def public_url(path: Path) -> str:
    return "/" + path.relative_to(PROJECT_ROOT / "public").as_posix()


def publish_work(
    work: Work,
    legacy_mapping: dict[Path, Path],
) -> tuple[str, str, int, str | None]:
    output_dir = PUBLIC_ROOT / (work.event.legacy_slug_prefix or work.event.slug) / work.slug
    output_dir.mkdir(parents=True, exist_ok=True)
    base_url = public_url(output_dir)
    conversion_error: str | None = None
    images = 0

    try:
        suffix = work.source.suffix.lower()
        if suffix == ".docx":
            body_html, plain_text, images = convert_docx(
                work.source, output_dir, base_url, work.title
            )
        elif suffix in LEGACY_SUFFIXES:
            converted = legacy_mapping.get(work.source)
            if not converted or not converted.is_file():
                raise FileNotFoundError("Word 未能生成兼容 DOCX")
            body_html, plain_text, images = convert_docx(converted, output_dir, base_url, work.title)
        elif suffix == ".pdf":
            body_html, plain_text = convert_pdf(work.source)
        elif suffix == ".txt":
            body_html, plain_text = text_to_html(read_text_file(work.source))
        else:  # pragma: no cover - gather_works 已过滤
            raise ValueError(f"不支持的格式：{suffix}")
    except (BadZipFile, ET.ParseError, KeyError, OSError, RuntimeError, ValueError) as error:
        conversion_error = f"{type(error).__name__}: {error}"
        body_html = "<p>该文档暂未能转换为网页正文，请联系管理员补录。</p>"
        plain_text = ""

    return body_html, plain_text, images, conversion_error


def article_date(work: Work) -> str:
    date_base = work.event.article_date_base or work.event.starts_at
    if not date_base:
        raise ValueError(f"{work.event.slug} 缺少文章日期基准")
    event_start = datetime.strptime(date_base, "%Y-%m-%d %H:%M:%S")
    source_time = datetime.fromtimestamp(work.source.stat().st_mtime)
    if abs(source_time.year - event_start.year) <= 1:
        return source_time.strftime("%Y-%m-%d %H:%M:%S")
    return (event_start + timedelta(minutes=work.sort_order)).strftime("%Y-%m-%d %H:%M:%S")


def category_for(work: Work) -> str | None:
    signal = f"{work.section} {work.source.name}"
    if "科幻组" in signal:
        return "science-fiction"
    if "奇幻组" in signal:
        return "fantasy"
    return None


def import_database(works: list[Work], converted: dict[str, tuple[str, str, int, str | None]]) -> None:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        with connection:
            connection.execute(
                "UPDATE categories SET description='科幻作品。' WHERE slug='science-fiction'"
            )
            connection.execute(
                "UPDATE categories SET description='奇幻作品。' WHERE slug='fantasy'"
            )
            category_ids = {
                row[0]: int(row[1])
                for row in connection.execute(
                    "SELECT slug, id FROM categories WHERE slug IN ('science-fiction','fantasy')"
                )
            }

            works_by_event = {event.slug: [] for event in EVENTS}
            for work in works:
                works_by_event[work.event.slug].append(work)

            for event in EVENTS:
                event_works = works_by_event[event.slug]
                connection.execute(
                    """
                    INSERT INTO events(
                      slug, title, event_group, summary, content_html, starts_at, ends_at,
                      status_override, banner_url, is_featured, sort_order
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ended', NULL, 0, ?)
                    ON CONFLICT(slug) DO UPDATE SET
                      title=excluded.title,
                      summary=excluded.summary,
                      content_html=excluded.content_html,
                      starts_at=excluded.starts_at,
                      ends_at=excluded.ends_at,
                      status_override=excluded.status_override,
                      updated_at=CURRENT_TIMESTAMP
                    """,
                    (
                        event.slug,
                        event.title,
                        "poxiao" if event.slug.endswith("-poxiao") else "other",
                        event.summary,
                        "",
                        event.starts_at,
                        event.ends_at,
                        event.sort_order,
                    ),
                )
                event_id = int(
                    connection.execute("SELECT id FROM events WHERE slug=?", (event.slug,)).fetchone()[0]
                )

                for work in event_works:
                    content_html, plain_text, _images, _error = converted[work.slug]
                    excerpt_prefix = work.event.title
                    if work.section:
                        excerpt_prefix += " · " + work.section.replace(" / ", " · ")
                    plain_excerpt = re.sub(r"\s+", " ", plain_text).strip()[:120]
                    excerpt = excerpt_prefix + (f"｜{plain_excerpt}" if plain_excerpt else "")
                    connection.execute(
                        """
                        INSERT INTO articles(
                          slug, title, excerpt, content_html, status, published_at,
                          cover_url, is_pinned, legacy_url, updated_at
                        ) VALUES (?, ?, ?, ?, 'published', ?, NULL, 0, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(slug) DO UPDATE SET
                          title=excluded.title,
                          excerpt=excluded.excerpt,
                          content_html=excluded.content_html,
                          status='published',
                          published_at=excluded.published_at,
                          cover_url=NULL,
                          legacy_url=excluded.legacy_url,
                          updated_at=CURRENT_TIMESTAMP
                        """,
                        (
                            work.slug,
                            work.title,
                            excerpt,
                            content_html,
                            article_date(work),
                            f"local:activity-archive/{work.archive_relative}",
                        ),
                    )
                    article_id = int(
                        connection.execute("SELECT id FROM articles WHERE slug=?", (work.slug,)).fetchone()[0]
                    )
                    connection.execute("DELETE FROM article_categories WHERE article_id=?", (article_id,))
                    category_slug = category_for(work)
                    if category_slug and category_slug in category_ids:
                        connection.execute(
                            "INSERT INTO article_categories(article_id, category_id) VALUES (?, ?)",
                            (article_id, category_ids[category_slug]),
                        )
                    connection.execute(
                        """
                        INSERT INTO event_articles(event_id, article_id, section_path, sort_order)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(event_id, article_id) DO UPDATE SET
                          section_path=excluded.section_path,
                          sort_order=excluded.sort_order
                        """,
                        (event_id, article_id, work.section, work.sort_order),
                    )

                if event.slug == "summer-2019":
                    second_id = connection.execute(
                        "SELECT id FROM events WHERE slug='second-poxiao'"
                    ).fetchone()[0]
                    # Old imports linked these four works to the second 破晓.
                    connection.executemany(
                        "DELETE FROM event_articles WHERE event_id=? AND article_id="
                        "(SELECT id FROM articles WHERE slug=?)",
                        [(second_id, work.slug) for work in event_works],
                    )
                    restructure_poxiao_event(connection, int(second_id))
                elif event.slug.endswith("-poxiao"):
                    restructure_poxiao_event(connection, event_id)
    finally:
        connection.close()


def write_reports(
    works: list[Work],
    skipped: list[dict[str, str]],
    conversion_messages: list[str],
    converted: dict[str, tuple[str, str, int, str | None]],
) -> None:
    event_counts = [
        {
            "slug": event.slug,
            "title": event.title,
            "works": sum(1 for work in works if work.event.slug == event.slug),
        }
        for event in EVENTS
    ]
    failures = [
        {"slug": work.slug, "path": work.archive_relative, "error": converted[work.slug][3]}
        for work in works
        if converted[work.slug][3]
    ]
    report = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "events": event_counts,
        "totals": {
            "events": len(EVENTS),
            "works": len(works),
            "images": sum(item[2] for item in converted.values()),
            "conversion_fallbacks": len(failures),
            "skipped_documents": len(skipped),
        },
        "conversion_messages": conversion_messages,
        "conversion_fallbacks": failures,
        "skipped": skipped,
    }
    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# 其余活动导入报告",
        "",
        f"- 生成时间：{report['generated_at']}",
        f"- 活动：{len(EVENTS)} 个",
        f"- 作品：{len(works)} 篇",
        f"- 提取图片：{report['totals']['images']} 张",
        f"- 仅提供原文件下载、未提取出网页正文：{len(failures)} 篇",
        f"- 跳过的评议/统计等资料：{len(skipped)} 份",
        "",
        "## 活动清单",
        "",
    ]
    lines.extend(f"- {item['title']}：{item['works']} 篇" for item in event_counts)
    if failures:
        lines.extend(["", "## 正文转换回退", ""])
        lines.extend(f"- `{item['path']}`：{item['error']}" for item in failures)
    lines.extend(
        [
            "",
            "## 说明",
            "",
            "- 原始活动目录没有被修改。",
            "- 文章末尾不附原始文档下载链接。",
            "- 评议表、统计表、名单和活动管理文档不会作为文章发布。",
            "- 完整的跳过清单与 Word 转换日志见 `data/remaining_activities_import_report.json`。",
            "",
        ]
    )
    REPORT_MD.parent.mkdir(parents=True, exist_ok=True)
    REPORT_MD.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    global DATABASE_PATH, ARCHIVE_ROOT

    parser = argparse.ArgumentParser(description="导入第二届至第九届破晓及同期写作活动")
    parser.add_argument("--database", type=Path, default=DATABASE_PATH)
    parser.add_argument("--source", type=Path, default=ARCHIVE_ROOT)
    args = parser.parse_args()

    DATABASE_PATH = args.database.resolve()
    ARCHIVE_ROOT = args.source.resolve()
    if not DATABASE_PATH.is_file():
        raise FileNotFoundError(f"找不到网站数据库：{DATABASE_PATH}")
    if not ARCHIVE_ROOT.is_dir():
        raise FileNotFoundError(f"找不到活动资料目录：{ARCHIVE_ROOT}")

    works, skipped = gather_works()
    legacy_mapping, conversion_messages = prepare_legacy_documents(works)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)

    converted: dict[str, tuple[str, str, int, str | None]] = {}
    for index, work in enumerate(works, start=1):
        converted[work.slug] = publish_work(work, legacy_mapping)
        if index % 50 == 0 or index == len(works):
            print(f"已转换 {index}/{len(works)} 篇")

    import_database(works, converted)
    write_reports(works, skipped, conversion_messages, converted)
    failures = sum(1 for item in converted.values() if item[3])
    print(
        f"导入完成：活动 {len(EVENTS)} 个，作品 {len(works)} 篇，"
        f"正文转换回退 {failures} 篇，跳过管理资料 {len(skipped)} 份。"
    )


if __name__ == "__main__":
    main()
