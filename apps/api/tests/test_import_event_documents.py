"""Keep evaluation downloads separate from the work manuscripts."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from import_event_documents import event_slug_for, is_event_document  # noqa: E402


class EventDocumentTests(unittest.TestCase):
    def test_distinguishes_reviews_from_work_titles(self) -> None:
        self.assertTrue(is_event_document(Path("第五届“破晓”决赛评议表.xlsx")))
        self.assertTrue(is_event_document(Path("第一届奇幻组总分及晋级名单.xlsx")))
        self.assertFalse(is_event_document(Path("奇幻组第一轮《审判》.docx")))
        self.assertFalse(is_event_document(Path("评论集.docx")))
        self.assertFalse(is_event_document(Path("~$评议表.xlsx")))

    def test_assigns_nested_activities_before_parent_poxiao(self) -> None:
        self.assertEqual(
            event_slug_for(Path("4.第四届破晓/2021冬活/2021冬活评议表.xlsx")),
            "winter-2021",
        )
        self.assertEqual(
            event_slug_for(Path("5.第五届破晓/第五届破晓关键词+评议表/评议表.xlsx")),
            "fifth-poxiao",
        )
        self.assertEqual(
            event_slug_for(Path("9.第九届破晓/2026夏日活动-融合写作/作品编号表.xlsx")),
            "summer-2026-fusion",
        )
        self.assertEqual(
            event_slug_for(Path("2.第二届破晓/夏活评议表.xlsx")),
            "summer-2019",
        )


if __name__ == "__main__":
    unittest.main()
