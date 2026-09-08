import concurrent.futures
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("worker", ROOT / "python/worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name).resolve()
        subprocess.run([sys.executable, str(ROOT / "test/fixtures.py"), str(self.folder)], check=True)
        self.pdf = self.folder / "manual.pdf"
        self.config = {"allowedRoots": [str(self.folder)], "cacheDir": str(self.folder / "cache"),
                       "maxPdfBytes": 10000000, "maxDocumentPages": 100, "maxTextChars": 12000,
                       "maxCandidates": 30, "maxExportPages": 8, "dpi": 100, "maxImageSide": 1000}
        self.engine = worker.Evidence(self.config, str(self.pdf))

    def test_batch_reads_and_locations_preserve_single_page_results(self):
        pages = self.engine.read_many({"pages": [1, 3]})
        self.assertEqual(pages["pages"], [self.engine.page({"page": p}) for p in [1, 3]])
        requests = [{"page": 1, "quote": "Change is -112"}, {"page": 1, "quote": "not in this PDF"}]
        locations = self.engine.locate_many({"requests": requests})
        self.assertEqual(locations["results"], [self.engine.locate(r) for r in requests])
        with self.assertRaises(ValueError):
            self.engine.read_many({"pages": [1, 999]})
        with self.assertRaises(ValueError):
            self.engine.read_many({"pages": [1] * 25})

    def test_explicit_caption_outranks_repeated_mentions(self):
        self.engine.existing_index = lambda: {"pages": [
            {"page": 1, "text": "Figure 1 overview results " * 15},
            {"page": 2, "text": "Figure 10: overview results"},
            {"page": 3, "text": "Figure 1: A precise relationship."}], "total_pages": 3}
        self.engine.coverage = lambda *args: {}
        hit = self.engine.search({"query": "Figure 1 overview results"})["hits"][0]
        self.assertEqual(hit["page"], 3)
        self.assertIn("Figure 1:", hit["excerpt"])

    def tearDown(self):
        self.temp.cleanup()

    def test_partial_index_extends_and_never_shrinks(self):
        self.assertTrue(self.engine.inspect({"limit": 1})["coverage"]["partial"])
        self.assertTrue(self.engine.search({"query": "api"})["coverage"]["partial"])
        self.assertFalse(self.engine.inspect({})["coverage"]["partial"])
        self.assertEqual(self.engine.inspect({"limit": 1})["coverage"]["indexedPages"], 4)

    def test_casefold_chinese_and_empty_retrieval(self):
        self.assertEqual(self.engine.search({"query": "api"})["hits"][0]["page"], 1)
        self.assertEqual(self.engine.search({"query": "审批策略"})["hits"][0]["page"], 2)
        self.assertEqual(self.engine.search({"query": "unfindable987"})["hits"], [])
        self.assertEqual(self.engine.search({"query": "什么"})["hits"], [])

    def test_scan_is_uncovered_until_noted(self):
        result = self.engine.search({"query": "torque"})
        self.assertEqual(result["hits"], [])
        self.assertIn(3, result["coverage"]["unreadLowTextPages"])
        evidence = self.engine.page({"page": 3}, image=True)
        self.assertTrue(evidence["pngBase64"].startswith("iVBOR"))
        self.engine.note({"page": 3, "evidenceId": evidence["evidenceId"], "summary": "torque is 42 Nm", "keywords": ["torque"]})
        result = self.engine.search({"query": "torque"})
        self.assertEqual(result["hits"][0]["page"], 3)
        self.assertNotIn(3, result["coverage"]["unreadLowTextPages"])

    def test_quote_never_accepts_a_fabricated_suffix_or_changed_sign(self):
        self.assertEqual(self.engine.verify({"page": 1, "quote": "Change is -112"})["status"], "literal_match")
        self.assertEqual(self.engine.verify({"page": 1, "quote": "Change is +112"})["status"], "not_found_in_text_layer")
        self.assertEqual(self.engine.verify({"page": 1, "quote": "API policy default is OFF. Fabricated."})["status"], "not_found_in_text_layer")
        self.assertFalse(self.engine.verify({"page": 1, "quote": "API"})["semanticVerified"])

    def test_export_escapes_html_and_embeds_images(self):
        result = self.engine.export({"question": "<script>alert(1)</script>", "claims": [{"text": "<img src=x onerror=alert(1)>", "pages": [1, 3]}]})
        body = Path(result["path"]).read_text()
        self.assertNotIn("<script>", body)
        self.assertIn("&lt;script&gt;", body)
        self.assertEqual(body.count("data:image/png;base64,"), 2)
        self.assertIn('href="#p3"', body)

    def test_quote_geometry_is_literal_and_scan_falls_back(self):
        result = self.engine.locate({"page": 1, "quote": "Change is -112"})
        self.assertEqual(result["status"], "located_text")
        for match in result["matches"]:
            for x0, y0, x1, y1 in match["regions"]:
                self.assertTrue(0 <= x0 < x1 <= 1)
                self.assertTrue(0 <= y0 < y1 <= 1)
        self.assertEqual(self.engine.locate({"page": 1, "quote": "Change is +112"})["matches"], [])
        self.assertEqual(self.engine.locate({"page": 3, "quote": "torque"})["precision"], "page_only")

    def test_rotated_multiline_duplicate_quote_geometry(self):
        path = self.folder / "rotated.pdf"
        with worker.fitz.open() as doc:
            page = doc.new_page(width=400, height=500)
            page.insert_text((30, 40), "First line\nsecond line\nFirst line\nsecond line")
            page.set_rotation(90)
            doc.save(path)
        engine = worker.Evidence(self.config, str(path))
        result = engine.locate({"page": 1, "quote": "First line second line"})
        self.assertEqual(len(result["matches"]), 2)
        self.assertEqual(len(result["matches"][0]["regions"]), 2)
        with worker.fitz.open(path) as doc:
            rect = doc[0].search_for("First line")[0] * doc[0].rotation_matrix
            expected = [rect.x0 / 500, rect.y0 / 400, rect.x1 / 500, rect.y1 / 400]
        for actual, wanted in zip(result["matches"][0]["regions"][0], expected):
            self.assertAlmostEqual(actual, wanted, places=5)

    def test_path_and_page_boundaries(self):
        with self.assertRaises(ValueError):
            worker.Evidence({**self.config, "allowedRoots": [str(self.folder / "cache")]}, str(self.pdf))
        for page in (0, -1, 5, 1.5, True):
            with self.assertRaises(ValueError):
                self.engine.page({"page": page})
        with self.assertRaises(ValueError):
            self.engine.search({"query": "API", "top": -1})
        self.engine.config["maxCandidates"] = 2
        self.assertTrue(self.engine.search({"query": "api"})["hits"])

    def test_export_rejects_undeclared_inline_citation(self):
        with self.assertRaises(ValueError):
            self.engine.export({"question": "Default?", "claims": [{"text": "OFF [第4页]", "pages": [1]}]})

    def test_note_rejects_another_documents_evidence(self):
        with self.assertRaises(ValueError):
            self.engine.note({"page": 1, "evidenceId": "forged:p1", "summary": "bad"})

    def test_content_hash_changes_but_rename_reuses_index(self):
        self.engine.inspect({})
        renamed = self.folder / "renamed.pdf"
        renamed.write_bytes(self.pdf.read_bytes())
        same = worker.Evidence(self.config, str(renamed))
        self.assertEqual(same.sha, self.engine.sha)
        with self.pdf.open("ab") as stream:
            stream.write(b"\n% changed document\n")
        changed = worker.Evidence(self.config, str(self.pdf))
        self.assertNotEqual(changed.sha, self.engine.sha)

    def test_concurrent_writers_preserve_full_coverage(self):
        def invoke(limit):
            payload = {"config": self.config, "operation": "inspect", "args": {"pdf": str(self.pdf), "limit": limit}}
            subprocess.run([sys.executable, str(ROOT / "python/worker.py")], input=json.dumps(payload), text=True, capture_output=True, check=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(invoke, [1, 0, 2]))
        self.assertEqual(self.engine.existing_index()["pages"][-1]["page"], 4)

    def test_symlink_cannot_bypass_allowed_roots(self):
        restricted = self.folder / "restricted"
        restricted.mkdir()
        link = restricted / "linked.pdf"
        try:
            link.symlink_to(self.pdf)
        except OSError:
            self.skipTest("Symlink creation unavailable on this platform")
        with self.assertRaises(ValueError):
            worker.Evidence({**self.config, "allowedRoots": [str(restricted)]}, str(link))


if __name__ == "__main__":
    unittest.main()
