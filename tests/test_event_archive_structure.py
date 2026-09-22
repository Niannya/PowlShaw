"""Regression tests for the numbered 破晓 archive hierarchy."""

from __future__ import annotations

import sqlite3
import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from event_archive_structure import normalize_section_path, restructure_poxiao_event  # noqa: E402


class EventArchiveStructureTests(unittest.TestCase):
    def test_rounds_are_outer_and_genres_are_inner(self) -> None:
        cases = {
            "科幻组 / 第一轮": "第一轮 / 科幻组",
            "奇幻组 / 第三轮": "第三轮 / 奇幻组",
            "科幻组 / 第四轮": "第四轮 / 科幻组",
            "奇幻组 / 半决赛复活组": "半决赛 / 奇幻组 / 复活组",
            "科幻组 / 终极对决": "决赛 / 科幻组",
            "决赛 / 奇幻组 / 终极对决": "决赛 / 奇幻组",
            "外场 / 第二轮": "外场 / 未分组 / 第二轮",
            "友谊赛 / 决赛": "决赛 / 友谊赛",
            "其他 / 未分组 / 友谊赛 / 决赛": "决赛 / 友谊赛",
            "友谊赛": "其他 / 友谊赛",
            "奇幻组 / 赛程未标明": "其他 / 奇幻组 / 赛程未标明",
        }
        for source, expected in cases.items():
            with self.subTest(source=source):
                self.assertEqual(normalize_section_path(source), expected)
                self.assertEqual(normalize_section_path(expected), expected)

    def test_external_works_follow_finals_and_other_works_follow_external(self) -> None:
        db = sqlite3.connect(":memory:")
        db.execute(
            "CREATE TABLE event_articles(event_id INTEGER,article_id INTEGER,"
            "section_path TEXT,sort_order INTEGER)"
        )
        db.executemany(
            "INSERT INTO event_articles VALUES (1,?,?,?)",
            [
                (1, "外场 / 第一轮", 10),
                (2, "奇幻组 / 第三轮", 20),
                (3, "科幻组 / 第一轮", 30),
                (4, "友谊赛", 40),
                (5, "科幻组 / 决赛", 50),
                (6, "奇幻组 / 第一轮", 60),
                (7, "友谊赛 / 决赛", 70),
            ],
        )
        self.assertEqual(restructure_poxiao_event(db, 1), 7)
        result = db.execute(
            "SELECT article_id,section_path FROM event_articles WHERE event_id=1 ORDER BY sort_order"
        ).fetchall()
        self.assertEqual([row[0] for row in result], [3, 6, 2, 5, 7, 1, 4])
        self.assertEqual([row[1].split(" / ")[0] for row in result], [
            "第一轮", "第一轮", "第三轮", "决赛", "决赛", "外场", "其他"
        ])
        self.assertEqual(restructure_poxiao_event(db, 1), 7)
        self.assertEqual(
            db.execute("SELECT article_id,section_path FROM event_articles ORDER BY sort_order").fetchall(),
            result,
        )
        db.close()


if __name__ == "__main__":
    unittest.main()
