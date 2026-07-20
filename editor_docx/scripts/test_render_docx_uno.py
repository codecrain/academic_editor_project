from __future__ import annotations

import argparse
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("render-docx-uno.py")
SPEC = importlib.util.spec_from_file_location("render_docx_uno", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PageSelectionTests(unittest.TestCase):
    def test_parse_all_and_normalized_page_set(self) -> None:
        self.assertIsNone(MODULE.parse_pages("all"))
        self.assertEqual(MODULE.parse_pages("none"), ())
        self.assertEqual(MODULE.parse_pages("3, 1,3,2"), (1, 2, 3))

    def test_parse_pages_rejects_zero_and_empty_items(self) -> None:
        with self.assertRaises(argparse.ArgumentTypeError):
            MODULE.parse_pages("0")
        with self.assertRaises(argparse.ArgumentTypeError):
            MODULE.parse_pages("1,,2")

    def test_resolve_all_and_reject_out_of_range(self) -> None:
        self.assertEqual(MODULE.resolve_pages(None, 3), [1, 2, 3])
        self.assertEqual(MODULE.resolve_pages((), 3), [])
        with self.assertRaises(MODULE.RenderInputError):
            MODULE.resolve_pages((1, 4), 3)


class DimensionTests(unittest.TestCase):
    def test_portrait_and_landscape_fit_exact_bounding_box(self) -> None:
        self.assertEqual(MODULE.fit_page_dimensions(12240, 15840, 1700), (1314, 1700))
        self.assertEqual(MODULE.fit_page_dimensions(15840, 12240, 1700), (1700, 1314))

    def test_invalid_dimensions_are_rejected(self) -> None:
        with self.assertRaises(MODULE.RenderDocxError):
            MODULE.fit_page_dimensions(0, 15840, 1700)


class ManifestTests(unittest.TestCase):
    def test_artifact_manifest_has_path_size_and_sha256(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            artifact = Path(directory) / "document.pdf"
            artifact.write_bytes(b"pdf-content")
            manifest = MODULE.artifact_manifest(artifact)
            self.assertEqual(manifest["bytes"], 11)
            self.assertEqual(
                manifest["sha256"], hashlib.sha256(b"pdf-content").hexdigest()
            )
            self.assertEqual(manifest["path"], str(artifact.resolve()))

    def test_publish_artifacts_uses_stable_names_and_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging = root / "staging"
            output = root / "output"
            staging.mkdir()
            output.mkdir()
            pdf = staging / "source.pdf"
            page = staging / "source.webp"
            pdf.write_bytes(b"pdf")
            page.write_bytes(b"webp")
            pdf_manifest, pages = MODULE.publish_artifacts(
                output,
                pdf,
                [
                    {
                        "page": 2,
                        "stagedPath": page,
                        "width": 1314,
                        "height": 1700,
                        "quality": 20,
                    }
                ],
            )
            self.assertEqual(Path(pdf_manifest["path"]).name, "document.pdf")
            self.assertEqual(Path(pages[0]["path"]).name, "page-002.webp")
            self.assertEqual(pages[0]["format"], "webp")
            self.assertEqual(pages[0]["quality"], 20)


class RuntimeLifecycleTests(unittest.TestCase):
    def test_enter_cleans_up_when_start_fails(self) -> None:
        runtime = MODULE.OfficeRuntime(Path("soffice"), 1.0, 1.0)
        cleanup_calls: list[bool] = []

        def fail_start() -> None:
            raise MODULE.OfficeStartError("start failed")

        def record_cleanup():
            cleanup_calls.append(True)
            return None

        runtime.start = fail_start
        runtime.close = record_cleanup
        with self.assertRaises(MODULE.OfficeStartError):
            runtime.__enter__()
        self.assertEqual(cleanup_calls, [True])


class CliContractTests(unittest.TestCase):
    def test_success_prints_exactly_one_json_manifest_line(self) -> None:
        captured = io.StringIO()

        def fake_renderer(arguments: argparse.Namespace) -> dict[str, object]:
            self.assertIsNone(arguments.pages)
            self.assertEqual(arguments.quality, 20)
            self.assertEqual(arguments.max_size, 1700)
            return {"ok": True, "pageCount": 1}

        with redirect_stdout(captured):
            exit_code = MODULE.run_cli(["input.docx", "output"], fake_renderer)
        lines = captured.getvalue().splitlines()
        self.assertEqual(exit_code, 0)
        self.assertEqual(len(lines), 1)
        self.assertEqual(json.loads(lines[0]), {"ok": True, "pageCount": 1})

    def test_invalid_cli_still_prints_one_error_manifest_line(self) -> None:
        captured = io.StringIO()
        with redirect_stdout(captured):
            exit_code = MODULE.run_cli(
                ["input.docx", "output", "--pages", "1,,2"],
                lambda _arguments: {"ok": True},
            )
        lines = captured.getvalue().splitlines()
        manifest = json.loads(lines[0])
        self.assertEqual(exit_code, 1)
        self.assertEqual(len(lines), 1)
        self.assertFalse(manifest["ok"])
        self.assertEqual(manifest["error"]["code"], "invalid_input")

    def test_pages_none_reaches_renderer_as_empty_selection(self) -> None:
        captured = io.StringIO()

        def fake_renderer(arguments: argparse.Namespace) -> dict[str, object]:
            self.assertEqual(arguments.pages, ())
            return {"ok": True, "pageCount": 4, "selectedPages": [], "pages": []}

        with redirect_stdout(captured):
            exit_code = MODULE.run_cli(
                ["input.docx", "output", "--pages", "none"], fake_renderer
            )
        manifest = json.loads(captured.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(manifest["selectedPages"], [])
        self.assertEqual(manifest["pages"], [])


if __name__ == "__main__":
    unittest.main()
