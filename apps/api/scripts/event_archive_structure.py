"""Canonical display hierarchy for the nine numbered 破晓 archives.

Rounds are the outer level, genres the inner level. Extra rounds are retained;
unlabelled genres stay in 未分组 rather than being guessed from prose.
"""

from __future__ import annotations

import re
import sqlite3


ROUND_WORDS = ("一", "二", "三", "四", "五", "六", "七", "八", "九", "十")
SPECIAL_STAGES = ("预赛", "半决赛", "决赛", "外场", "其他")
TRACKS = ("科幻组", "奇幻组", "友谊赛", "未分组")


def round_number(value: str) -> int | None:
    match = re.fullmatch(r"第?([一二三四五六七八九十]|\d+)轮", value)
    if not match:
        return None
    word = match.group(1)
    return ROUND_WORDS.index(word) + 1 if word in ROUND_WORDS else int(word)


def round_label(number: int) -> str:
    return f"第{ROUND_WORDS[number - 1] if 1 <= number <= 10 else number}轮"


def stage_order(stage: str) -> int:
    if stage == "预赛":
        return 0
    number = round_number(stage)
    if number is not None:
        return number
    return {"半决赛": 100, "决赛": 110, "外场": 120, "其他": 130}[stage]


def normalize_section_path(section: str) -> str:
    parts = [part.strip() for part in re.split(r"\s*(?:/|／|>|＞)\s*", section) if part.strip()]
    track = next((name for name in TRACKS[:-1] if name in section), "未分组")

    # If the outer stage was already normalized, honor it. In particular,
    # “外场 / 决赛” remains 外场. An old “其他 / 友谊赛 / 决赛” may be
    # reconsidered because the round must take precedence over the group.
    first = parts[0] if parts else ""
    if first in SPECIAL_STAGES and first != "其他":
        stage = first
    elif (number := round_number(first)) is not None:
        stage = round_label(number)
    elif "外场" in section:
        stage = "外场"
    elif "预赛" in section:
        stage = "预赛"
    elif "半决赛" in section:
        stage = "半决赛"
    elif "终极对决" in section or "决赛" in section:
        stage = "决赛"
    else:
        number = next((n for part in parts if (n := round_number(part)) is not None), None)
        stage = round_label(number) if number is not None else "其他"

    path = [stage, track]
    for part in parts:
        if part in {stage, track, "未分组", "其他"}:
            continue
        part_round = round_number(part)
        if stage != "外场" and part_round is not None and round_label(part_round) == stage:
            continue
        if stage == "决赛" and part == "决赛":
            continue
        if stage == "预赛" and part == "预赛":
            continue
        if stage == "半决赛" and part == "半决赛":
            continue
        if stage == "半决赛" and "复活组" in part:
            part = "复活组"
        if stage == "决赛" and part == "终极对决":
            continue
        path.append(part)
    if stage == "其他" and len(path) == 2 and track == "未分组":
        path.append("赛程未标明")
    return " / ".join(path)


def restructure_poxiao_event(db: sqlite3.Connection, event_id: int) -> int:
    """Put stages in fixed order and keep source order within each genre."""
    rows = db.execute(
        "SELECT article_id, section_path, sort_order FROM event_articles "
        "WHERE event_id=? ORDER BY sort_order, article_id",
        (event_id,),
    ).fetchall()
    normalized = [
        (article_id, normalize_section_path(section or ""), sort_order, original_index)
        for original_index, (article_id, section, sort_order) in enumerate(rows)
    ]

    def display_order(item: tuple[int, str, int, int]) -> tuple[int, int, int]:
        parts = item[1].split(" / ")
        return stage_order(parts[0]), TRACKS.index(parts[1]), item[3]

    normalized.sort(key=display_order)
    for position, (article_id, section, _old_order, _original_index) in enumerate(normalized, 1):
        db.execute(
            "UPDATE event_articles SET section_path=?, sort_order=? "
            "WHERE event_id=? AND article_id=?",
            (section, position * 10, event_id, article_id),
        )
    return len(normalized)
