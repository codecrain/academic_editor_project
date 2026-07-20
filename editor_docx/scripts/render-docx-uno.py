#!/usr/bin/env python3
"""Render a DOCX to PDF and selected WebP pages through Collabora UNO.

This helper is intentionally a single-shot process.  It owns an isolated
Collabora profile and UNO pipe, emits exactly one JSON manifest on stdout, and
shuts down every process it starts before publishing the rendered artifacts.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from typing import Any, Callable, Iterable, Sequence
import uuid


DEFAULT_SOFFICE = "/opt/collaboraoffice/program/soffice"
DEFAULT_QUALITY = 20
DEFAULT_MAX_SIZE = 1700
DEFAULT_CONNECT_TIMEOUT = 20.0
DEFAULT_OPERATION_TIMEOUT = 180.0
DEFAULT_SHUTDOWN_TIMEOUT = 10.0


class RenderDocxError(RuntimeError):
    """Base error with a stable machine-readable code."""

    code = "render_failed"


class RenderInputError(RenderDocxError):
    code = "invalid_input"


class UnoUnavailableError(RenderDocxError):
    code = "uno_unavailable"


class OfficeStartError(RenderDocxError):
    code = "office_start_failed"


class OfficeConnectTimeout(RenderDocxError):
    code = "office_connect_timeout"


class OperationTimeout(RenderDocxError):
    code = "operation_timeout"


class TerminationRequested(RenderDocxError):
    code = "termination_requested"


class CleanupError(RenderDocxError):
    code = "cleanup_failed"


class JsonArgumentParser(argparse.ArgumentParser):
    """Raise instead of printing usage and exiting on invalid arguments."""

    def error(self, message: str) -> None:
        raise RenderInputError(message)


def positive_float(value: str) -> float:
    try:
        parsed = float(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("must be a number") from error
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def bounded_int(minimum: int, maximum: int) -> Callable[[str], int]:
    def parse(value: str) -> int:
        try:
            parsed = int(value)
        except ValueError as error:
            raise argparse.ArgumentTypeError("must be an integer") from error
        if not minimum <= parsed <= maximum:
            raise argparse.ArgumentTypeError(
                f"must be between {minimum} and {maximum}"
            )
        return parsed

    return parse


def parse_pages(value: str) -> tuple[int, ...] | None:
    """Parse ``all``, ``none``, or a sorted set of 1-based pages."""

    normalized = str(value).strip().lower()
    if normalized == "all":
        return None
    if normalized == "none":
        return ()
    if not normalized:
        raise argparse.ArgumentTypeError(
            "pages must be 'all', 'none', or a comma-separated list"
        )
    parsed: set[int] = set()
    for item in normalized.split(","):
        item = item.strip()
        if not item:
            raise argparse.ArgumentTypeError("pages contains an empty item")
        try:
            page = int(item)
        except ValueError as error:
            raise argparse.ArgumentTypeError(f"invalid page number: {item}") from error
        if page <= 0:
            raise argparse.ArgumentTypeError("page numbers are 1-based and must be positive")
        parsed.add(page)
    return tuple(sorted(parsed))


def resolve_pages(requested: tuple[int, ...] | None, page_count: int) -> list[int]:
    if page_count <= 0:
        raise RenderDocxError("Collabora reported a document with no pages")
    selected = list(range(1, page_count + 1)) if requested is None else list(requested)
    invalid = [page for page in selected if page > page_count]
    if invalid:
        joined = ",".join(str(page) for page in invalid)
        raise RenderInputError(
            f"requested page(s) outside document range 1-{page_count}: {joined}"
        )
    return selected


def fit_page_dimensions(width: int, height: int, max_size: int) -> tuple[int, int]:
    """Fit logical page dimensions into a square bounding box."""

    if width <= 0 or height <= 0:
        raise RenderDocxError(f"invalid page dimensions: {width}x{height}")
    if max_size <= 0:
        raise RenderInputError("max size must be greater than zero")
    scale = min(max_size / width, max_size / height)
    return max(1, round(width * scale)), max(1, round(height * scale))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_manifest(path: Path) -> dict[str, Any]:
    stat_result = path.stat()
    if stat_result.st_size <= 0:
        raise RenderDocxError(f"renderer created an empty artifact: {path.name}")
    return {
        "path": str(path.resolve()),
        "bytes": stat_result.st_size,
        "sha256": sha256_file(path),
    }


def build_parser() -> JsonArgumentParser:
    parser = JsonArgumentParser(
        description="Render DOCX to PDF and selected WebP pages using Collabora UNO."
    )
    parser.add_argument("source", help="Source .docx file")
    parser.add_argument("output_dir", help="Directory for document.pdf and page-NNN.webp")
    parser.add_argument(
        "--pages",
        type=parse_pages,
        default=None,
        metavar="all|none|1,3,5",
        help="Pages to render; use none for PDF-only; default: all",
    )
    parser.add_argument(
        "--quality",
        type=bounded_int(0, 100),
        default=DEFAULT_QUALITY,
        help=f"Lossy WebP quality; default: {DEFAULT_QUALITY}",
    )
    parser.add_argument(
        "--max-size",
        type=bounded_int(1, 10000),
        default=DEFAULT_MAX_SIZE,
        help=f"Maximum width and height in pixels; default: {DEFAULT_MAX_SIZE}",
    )
    parser.add_argument(
        "--connect-timeout",
        type=positive_float,
        default=DEFAULT_CONNECT_TIMEOUT,
        help=f"UNO connection timeout in seconds; default: {DEFAULT_CONNECT_TIMEOUT:g}",
    )
    parser.add_argument(
        "--operation-timeout",
        type=positive_float,
        default=DEFAULT_OPERATION_TIMEOUT,
        help=f"Whole operation timeout in seconds; default: {DEFAULT_OPERATION_TIMEOUT:g}",
    )
    parser.add_argument(
        "--shutdown-timeout",
        type=positive_float,
        default=DEFAULT_SHUTDOWN_TIMEOUT,
        help=f"Graceful office shutdown timeout in seconds; default: {DEFAULT_SHUTDOWN_TIMEOUT:g}",
    )
    parser.add_argument(
        "--soffice",
        default=os.environ.get("COLLABORA_SOFFICE_PATH", DEFAULT_SOFFICE),
        help="Path to the Collabora soffice executable",
    )
    return parser


def validate_paths(source: Path, output_dir: Path, soffice: Path) -> None:
    if not source.is_file():
        raise RenderInputError(f"source DOCX does not exist: {source}")
    if source.suffix.lower() != ".docx":
        raise RenderInputError(f"source must be a .docx file: {source.name}")
    if output_dir.exists() and not output_dir.is_dir():
        raise RenderInputError(f"output path is not a directory: {output_dir}")
    if not soffice.is_file():
        raise RenderInputError(f"soffice executable does not exist: {soffice}")


def _property_factory() -> tuple[Any, Callable[[str, Any], Any]]:
    try:
        import uno  # type: ignore
        from com.sun.star.beans import PropertyValue  # type: ignore
    except ImportError as error:
        raise UnoUnavailableError(
            "UNO is unavailable; run this helper with Collabora's bundled Python"
        ) from error

    def prop(name: str, value: Any) -> Any:
        item = PropertyValue()
        item.Name = name
        item.Value = value
        return item

    return uno, prop


def _close_component(component: Any, *, suppress_control: bool = False) -> None:
    if component is None:
        return
    try:
        component.close(True)
        return
    except (OperationTimeout, TerminationRequested):
        if not suppress_control:
            raise
    except Exception:
        pass
    try:
        component.dispose()
    except (OperationTimeout, TerminationRequested):
        if not suppress_control:
            raise
    except Exception:
        pass


def _process_group_exists(process_group_id: int) -> bool:
    if not hasattr(os, "killpg"):
        return False
    try:
        os.killpg(process_group_id, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _signal_process_group(process_group_id: int, signum: int) -> None:
    if hasattr(os, "killpg"):
        try:
            os.killpg(process_group_id, signum)
            return
        except ProcessLookupError:
            return
    try:
        os.kill(process_group_id, signum)
    except ProcessLookupError:
        pass


def _owned_profile_pids(profile_uri: str) -> list[int]:
    """Find only office processes carrying this helper's unique profile URI."""

    proc_root = Path("/proc")
    if not proc_root.is_dir():
        return []
    found: list[int] = []
    for entry in proc_root.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            command = (entry / "cmdline").read_bytes().replace(b"\x00", b" ").decode(
                "utf-8", "replace"
            )
        except (OSError, PermissionError):
            continue
        if profile_uri not in command:
            continue
        if "/opt/collaboraoffice/program/" not in command and "soffice" not in command:
            continue
        found.append(int(entry.name))
    return sorted(found)


def _signal_pids(pids: Iterable[int], signum: int) -> None:
    for pid in pids:
        try:
            os.kill(pid, signum)
        except (ProcessLookupError, PermissionError):
            pass


def _wait_until(predicate: Callable[[], bool], timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return predicate()


class OfficeRuntime:
    """Own the isolated Collabora process, profile, pipe, and UNO documents."""

    def __init__(
        self,
        soffice: Path,
        connect_timeout: float,
        shutdown_timeout: float,
    ) -> None:
        self.soffice = soffice
        self.connect_timeout = connect_timeout
        self.shutdown_timeout = shutdown_timeout
        self.pipe_name = f"academic_editor_{uuid.uuid4().hex}"
        self.profile_dir: Path | None = None
        self.profile_uri: str | None = None
        self.process: subprocess.Popen[bytes] | None = None
        self.desktop: Any = None
        self.writer: Any = None
        self.draw: Any = None
        self.uno: Any = None
        self.prop: Callable[[str, Any], Any] | None = None
        self.cleanup_report: dict[str, Any] = {
            "profileRemoved": True,
            "remainingOfficePids": [],
            "officeExitCode": None,
        }

    def __enter__(self) -> "OfficeRuntime":
        try:
            self.start()
        except BaseException as error:
            cleanup_error = self.close()
            if cleanup_error is not None:
                raise CleanupError(f"{error}; additionally, {cleanup_error}") from error
            raise
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> bool:
        cleanup_error = self.close()
        if cleanup_error is not None and exc is None:
            raise cleanup_error
        if cleanup_error is not None and exc is not None:
            raise CleanupError(f"{exc}; additionally, {cleanup_error}") from exc
        return False

    def start(self) -> None:
        self.uno, self.prop = _property_factory()
        self.profile_dir = Path(tempfile.mkdtemp(prefix="academic-editor-uno-profile-"))
        self.profile_uri = self.profile_dir.resolve().as_uri()
        command = [
            str(self.soffice),
            "--headless",
            "--nologo",
            "--nodefault",
            "--nofirststartwizard",
            "--norestore",
            f"-env:UserInstallation={self.profile_uri}",
            f"--accept=pipe,name={self.pipe_name};urp;StarOffice.ComponentContext",
        ]
        try:
            self.process = subprocess.Popen(
                command,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except OSError as error:
            raise OfficeStartError(f"failed to start Collabora: {error}") from error

        local_context = self.uno.getComponentContext()
        resolver = local_context.ServiceManager.createInstanceWithContext(
            "com.sun.star.bridge.UnoUrlResolver", local_context
        )
        deadline = time.monotonic() + self.connect_timeout
        last_error: Exception | None = None
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise OfficeStartError(
                    f"Collabora exited before UNO connected (exit {self.process.returncode})"
                )
            try:
                context = resolver.resolve(
                    f"uno:pipe,name={self.pipe_name};urp;StarOffice.ComponentContext"
                )
                service_manager = context.ServiceManager
                self.desktop = service_manager.createInstanceWithContext(
                    "com.sun.star.frame.Desktop", context
                )
                self._context = context
                self._service_manager = service_manager
                return
            except Exception as error:
                last_error = error
                time.sleep(0.1)
        detail = type(last_error).__name__ if last_error is not None else "unknown error"
        raise OfficeConnectTimeout(
            f"UNO pipe did not become ready within {self.connect_timeout:g}s ({detail})"
        )

    def render(
        self,
        source: Path,
        staging_dir: Path,
        requested_pages: tuple[int, ...] | None,
        quality: int,
        max_size: int,
    ) -> tuple[int, list[int], Path, list[dict[str, Any]]]:
        assert self.uno is not None
        assert self.prop is not None
        source_url = self.uno.systemPathToFileUrl(str(source.resolve()))
        self.writer = self.desktop.loadComponentFromURL(
            source_url,
            "_blank",
            0,
            (self.prop("Hidden", True), self.prop("ReadOnly", True)),
        )
        if self.writer is None:
            raise RenderDocxError("Collabora could not open the source DOCX")

        pdf_path = staging_dir / "document.pdf"
        self.writer.storeToURL(
            self.uno.systemPathToFileUrl(str(pdf_path.resolve())),
            (self.prop("FilterName", "writer_pdf_Export"), self.prop("Overwrite", True)),
        )
        _close_component(self.writer)
        self.writer = None
        if not pdf_path.is_file() or pdf_path.stat().st_size <= 0:
            raise RenderDocxError("Collabora did not create a non-empty PDF")

        self.draw = self.desktop.loadComponentFromURL(
            self.uno.systemPathToFileUrl(str(pdf_path.resolve())),
            "_blank",
            0,
            (
                self.prop("Hidden", True),
                self.prop("ReadOnly", True),
                self.prop("FilterName", "draw_pdf_import"),
            ),
        )
        if self.draw is None:
            raise RenderDocxError("Collabora could not reopen the rendered PDF")
        draw_pages = self.draw.getDrawPages()
        page_count = int(draw_pages.getCount())
        selected_pages = resolve_pages(requested_pages, page_count)
        page_results: list[dict[str, Any]] = []

        for page_number in selected_pages:
            page = draw_pages.getByIndex(page_number - 1)
            width, height = fit_page_dimensions(
                int(getattr(page, "Width")), int(getattr(page, "Height")), max_size
            )
            destination = staging_dir / f"page-{page_number:03d}.webp"
            filter_data = (
                self.prop("PixelWidth", width),
                self.prop("PixelHeight", height),
                self.prop("Quality", quality),
                self.prop("Lossless", False),
                self.prop("Preset", "text"),
                self.prop("Translucent", False),
            )
            exporter = self._service_manager.createInstanceWithContext(
                "com.sun.star.drawing.GraphicExportFilter", self._context
            )
            exporter.setSourceDocument(page)
            export_ok = exporter.filter(
                (
                    self.prop(
                        "URL", self.uno.systemPathToFileUrl(str(destination.resolve()))
                    ),
                    self.prop("MediaType", "image/webp"),
                    self.prop(
                        "FilterData",
                        self.uno.Any("[]com.sun.star.beans.PropertyValue", filter_data),
                    ),
                )
            )
            if not export_ok or not destination.is_file() or destination.stat().st_size <= 0:
                raise RenderDocxError(f"WebP export failed for page {page_number}")
            page_results.append(
                {
                    "page": page_number,
                    "stagedPath": destination,
                    "width": width,
                    "height": height,
                    "quality": quality,
                }
            )

        return page_count, selected_pages, pdf_path, page_results

    def close(self) -> CleanupError | None:
        with _cleanup_signal_shield():
            return self._close_without_signals()

    def _close_without_signals(self) -> CleanupError | None:
        errors: list[str] = []
        _close_component(self.draw, suppress_control=True)
        self.draw = None
        _close_component(self.writer, suppress_control=True)
        self.writer = None

        if self.desktop is not None:
            try:
                self.desktop.terminate()
            except Exception:
                pass
            self.desktop = None

        process = self.process
        if process is not None:
            try:
                process.wait(timeout=self.shutdown_timeout)
            except subprocess.TimeoutExpired:
                _signal_process_group(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=min(5.0, self.shutdown_timeout))
                except subprocess.TimeoutExpired:
                    _signal_process_group(process.pid, signal.SIGKILL)
                    try:
                        process.wait(timeout=5.0)
                    except subprocess.TimeoutExpired:
                        errors.append("Collabora process did not exit after SIGKILL")
            self.cleanup_report["officeExitCode"] = process.poll()
            if _process_group_exists(process.pid):
                _signal_process_group(process.pid, signal.SIGKILL)
                _wait_until(lambda: not _process_group_exists(process.pid), 5.0)

        profile_uri = self.profile_uri
        if profile_uri:
            remaining = _owned_profile_pids(profile_uri)
            if remaining:
                _signal_pids(remaining, signal.SIGTERM)
                _wait_until(lambda: not _owned_profile_pids(profile_uri), 3.0)
                remaining = _owned_profile_pids(profile_uri)
            if remaining:
                _signal_pids(remaining, signal.SIGKILL)
                _wait_until(lambda: not _owned_profile_pids(profile_uri), 3.0)
            remaining = _owned_profile_pids(profile_uri)
            self.cleanup_report["remainingOfficePids"] = remaining
            if remaining:
                errors.append("owned Collabora processes remain after cleanup")

        if self.profile_dir is not None:
            shutil.rmtree(self.profile_dir, ignore_errors=True)
            removed = not self.profile_dir.exists()
            self.cleanup_report["profileRemoved"] = removed
            if not removed:
                errors.append("temporary Collabora profile could not be removed")

        self.process = None
        self.profile_dir = None
        self.profile_uri = None
        if errors:
            return CleanupError("; ".join(errors))
        return None


@contextlib.contextmanager
def _cleanup_signal_shield():
    """Bound cleanup internally instead of interrupting it with another signal."""

    previous_handlers: dict[int, Any] = {}
    remaining_timer: tuple[float, float] | None = None
    for signum in (
        getattr(signal, "SIGTERM", None),
        getattr(signal, "SIGINT", None),
        getattr(signal, "SIGALRM", None),
    ):
        if signum is not None:
            previous_handlers[signum] = signal.getsignal(signum)
            signal.signal(signum, signal.SIG_IGN)
    if hasattr(signal, "setitimer"):
        remaining_timer = signal.setitimer(signal.ITIMER_REAL, 0)
    try:
        yield
    finally:
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)
        if remaining_timer and remaining_timer[0] > 0:
            signal.setitimer(signal.ITIMER_REAL, *remaining_timer)


@contextlib.contextmanager
def operation_signals(timeout: float):
    """Turn termination and wall-clock timeout signals into clean exceptions."""

    previous_handlers: dict[int, Any] = {}
    previous_timer: tuple[float, float] | None = None

    def handle_termination(signum: int, _frame: Any) -> None:
        raise TerminationRequested(f"received signal {signum}")

    def handle_timeout(_signum: int, _frame: Any) -> None:
        raise OperationTimeout(f"render operation exceeded {timeout:g}s")

    for signum in (getattr(signal, "SIGTERM", None), getattr(signal, "SIGINT", None)):
        if signum is not None:
            previous_handlers[signum] = signal.getsignal(signum)
            signal.signal(signum, handle_termination)

    alarm_signal = getattr(signal, "SIGALRM", None)
    if alarm_signal is not None and hasattr(signal, "setitimer"):
        previous_handlers[alarm_signal] = signal.getsignal(alarm_signal)
        signal.signal(alarm_signal, handle_timeout)
        previous_timer = signal.setitimer(signal.ITIMER_REAL, timeout)
    try:
        yield
    finally:
        if alarm_signal is not None and hasattr(signal, "setitimer"):
            signal.setitimer(signal.ITIMER_REAL, 0)
            if previous_timer and previous_timer[0] > 0:
                signal.setitimer(signal.ITIMER_REAL, *previous_timer)
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)


def publish_artifacts(
    output_dir: Path,
    staged_pdf: Path,
    staged_pages: Sequence[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    final_pdf = output_dir / "document.pdf"
    os.replace(staged_pdf, final_pdf)
    pdf_manifest = artifact_manifest(final_pdf)
    page_manifests: list[dict[str, Any]] = []
    for staged in staged_pages:
        page_number = int(staged["page"])
        final_page = output_dir / f"page-{page_number:03d}.webp"
        os.replace(Path(staged["stagedPath"]), final_page)
        page_manifests.append(
            {
                "page": page_number,
                "format": "webp",
                **artifact_manifest(final_page),
                "width": int(staged["width"]),
                "height": int(staged["height"]),
                "quality": int(staged["quality"]),
            }
        )
    return pdf_manifest, page_manifests


def render_docx(arguments: argparse.Namespace) -> dict[str, Any]:
    source = Path(arguments.source).expanduser().resolve()
    output_dir = Path(arguments.output_dir).expanduser().resolve()
    soffice = Path(arguments.soffice).expanduser().resolve()
    validate_paths(source, output_dir, soffice)
    output_dir.mkdir(parents=True, exist_ok=True)
    staging_dir = Path(tempfile.mkdtemp(prefix=".docx-uno-staging-", dir=output_dir))
    runtime = OfficeRuntime(
        soffice=soffice,
        connect_timeout=arguments.connect_timeout,
        shutdown_timeout=arguments.shutdown_timeout,
    )
    try:
        with runtime:
            page_count, selected_pages, staged_pdf, staged_pages = runtime.render(
                source=source,
                staging_dir=staging_dir,
                requested_pages=arguments.pages,
                quality=arguments.quality,
                max_size=arguments.max_size,
            )
        pdf_manifest, page_manifests = publish_artifacts(
            output_dir, staged_pdf, staged_pages
        )
        return {
            "ok": True,
            "renderer": "collabora-uno",
            "pageCount": page_count,
            "selectedPages": selected_pages,
            "pdf": pdf_manifest,
            "pages": page_manifests,
            "settings": {
                "format": "webp",
                "quality": arguments.quality,
                "maxWidth": arguments.max_size,
                "maxHeight": arguments.max_size,
                "background": "white",
                "metadata": "stripped",
            },
            "cleanup": runtime.cleanup_report,
        }
    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)


def error_manifest(error: BaseException) -> dict[str, Any]:
    message = " ".join(str(error).split())[:800] or type(error).__name__
    code = error.code if isinstance(error, RenderDocxError) else "unexpected_error"
    return {
        "ok": False,
        "error": {
            "code": code,
            "type": type(error).__name__,
            "message": message,
        },
    }


def run_cli(
    argv: Sequence[str] | None = None,
    renderer: Callable[[argparse.Namespace], dict[str, Any]] = render_docx,
) -> int:
    try:
        arguments = build_parser().parse_args(argv)
        if arguments.operation_timeout <= arguments.connect_timeout:
            raise RenderInputError(
                "operation timeout must be greater than the UNO connect timeout"
            )
        with operation_signals(arguments.operation_timeout):
            manifest = renderer(arguments)
        exit_code = 0 if manifest.get("ok") is True else 1
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            error = TerminationRequested(type(error).__name__)
        manifest = error_manifest(error)
        exit_code = 1
    print(
        json.dumps(
            manifest,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ),
        flush=True,
    )
    return exit_code


if __name__ == "__main__":
    sys.exit(run_cli())
