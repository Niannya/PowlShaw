"""The cleanup must not strip links that belong to the actual work."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from simplify_event_pages import remove_terminal_download_link  # noqa: E402


class DownloadLinkTests(unittest.TestCase):
    def test_removes_only_the_generated_trailing_link(self) -> None:
        original = (
            '<p><a href="https://example.test/reference">正文中的资料</a></p>'
            '<p><a href="/uploads/events/archive-import/second-poxiao/work/source.docx">'
            "下载原始文档（DOCX）</a></p>"
        )
        self.assertEqual(
            remove_terminal_download_link(original),
            '<p><a href="https://example.test/reference">正文中的资料</a></p>',
        )

    def test_leaves_other_links_and_plain_prose_untouched(self) -> None:
        html = '<p>作品正文</p><p><a href="/elsewhere">下载原始文档</a></p>'
        self.assertEqual(remove_terminal_download_link(html), html)


if __name__ == "__main__":
    unittest.main()
