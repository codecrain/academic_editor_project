import type { CommandDef, CommandServices } from '../types';
import { PageSetupDialog } from '@/ui/page-setup-dialog';
import { AboutDialog } from '@/ui/about-dialog';
import { showSaveAs } from '@/ui/save-as-dialog';
import { showUnsavedChangesDialog } from '@/ui/unsaved-changes-dialog';
import {
  HWP_AND_HWPX_SAVE_PICKER_TYPES,
  HWP_SAVE_PICKER_TYPES,
  HWPX_SAVE_PICKER_TYPES,
  pickSaveFileHandle,
  pickOpenFileHandle,
  readFileFromHandle,
  saveDocumentToFileSystem,
  writeBlobToHandle,
  type FileSystemFileHandleLike,
  type FileSystemWindowLike,
} from '@/command/file-system-access';

/** [Task #833] 사용자 명시 cancel 에러 검출.
 * - AbortError: showSaveFilePicker / showOpenFilePicker 다이얼로그 취소
 * - NotAllowedError: writeBlobToHandle 권한 거부 (Chrome "변경사항 저장" 프롬프트 취소)
 *
 * 두 케이스 모두 fallback download 우회 — 사용자가 명시적으로 취소했으므로
 * 의도하지 않은 Downloads 폴더 저장 + chrome-extension viewer 자동 연결 차단. */
function isUserCancelError(e: unknown): boolean {
  return e instanceof DOMException
      && (e.name === 'AbortError' || e.name === 'NotAllowedError');
}

type SaveFormat = 'hwp' | 'hwpx';

interface ExportedDocument {
  bytes: Uint8Array;
  blob: Blob;
  extension: '.hwp' | '.hwpx';
  pickerTypes: { description: string; accept: Record<string, string[]> }[];
  reflowedParagraphs: number;
}

function saveFormatForSource(sourceFormat: string): SaveFormat {
  return sourceFormat === 'hwpx' ? 'hwpx' : 'hwp';
}

function saveFormatForFileName(fileName: string, fallback: SaveFormat): SaveFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.hwpx')) return 'hwpx';
  if (lower.endsWith('.hwp')) return 'hwp';
  return fallback;
}

function defaultSaveFormat(sourceFormat: string, fileName: string): SaveFormat {
  return saveFormatForFileName(fileName, saveFormatForSource(sourceFormat));
}

function extensionForFormat(format: SaveFormat): '.hwp' | '.hwpx' {
  return format === 'hwpx' ? '.hwpx' : '.hwp';
}

function saveFileName(fileName: string, format: SaveFormat): string {
  const extension = extensionForFormat(format);
  const trimmed = fileName.trim() || `document${extension}`;
  if (/\.(hwp|hwpx)$/i.test(trimmed)) {
    return trimmed.replace(/\.(hwp|hwpx)$/i, extension);
  }
  return `${trimmed}${extension}`;
}

function saveBaseName(fileName: string, format: SaveFormat): string {
  return saveFileName(fileName, format).replace(/\.(hwp|hwpx)$/i, '');
}

function saveCurrentHandle(
  format: SaveFormat,
  handle: FileSystemFileHandleLike | null,
): FileSystemFileHandleLike | null {
  if (!handle) return null;
  return handle.name.toLowerCase().endsWith(extensionForFormat(format)) ? handle : null;
}

function exportDocumentForSave(services: CommandServices, format: SaveFormat): ExportedDocument {
  if (format === 'hwpx') {
    const warnings = services.wasm.getValidationWarnings();
    const reflowedParagraphs = warnings.count > 0 ? services.wasm.reflowLinesegs() : 0;
    if (reflowedParagraphs > 0) {
      services.eventBus.emit('document-changed', 'hwpx-save-reflow');
    }
    const bytes = services.wasm.exportHwpx();
    return {
      bytes,
      blob: new Blob([bytes as unknown as BlobPart], { type: 'application/hwp+zip' }),
      extension: '.hwpx',
      pickerTypes: HWPX_SAVE_PICKER_TYPES,
      reflowedParagraphs,
    };
  }

  const bytes = services.wasm.exportHwp();
  return {
    bytes,
    blob: new Blob([bytes as unknown as BlobPart], { type: 'application/x-hwp' }),
    extension: '.hwp',
    pickerTypes: HWP_SAVE_PICKER_TYPES,
    reflowedParagraphs: 0,
  };
}

export type SaveCurrentDocumentResult = 'saved' | 'cancelled' | 'failed';

export async function saveCurrentDocument(services: CommandServices): Promise<SaveCurrentDocumentResult> {
  try {
    const sourceFormat = services.wasm.getSourceFormat();
    const format = defaultSaveFormat(sourceFormat, services.wasm.fileName);
    const saveName = saveFileName(services.wasm.fileName, format);
    const exported = exportDocumentForSave(services, format);
    console.log(
      `[file:save] source=${sourceFormat}, format=${format}, ` +
      `reflowed=${exported.reflowedParagraphs}, ${exported.bytes.length} bytes`,
    );

    try {
      const saveResult = await saveDocumentToFileSystem({
        blob: exported.blob,
        suggestedName: saveName,
        currentHandle: saveCurrentHandle(format, services.wasm.currentFileHandle),
        windowLike: window as FileSystemWindowLike,
        saveTypes: exported.pickerTypes,
      });

      if (saveResult.method !== 'fallback') {
        services.wasm.currentFileHandle = saveResult.handle;
        services.wasm.fileName = saveFileName(saveResult.fileName, format);
        services.documentState.markClean('save');
        console.log(`[file:save] ${services.wasm.fileName} (${(exported.bytes.length / 1024).toFixed(1)}KB)`);
        return 'saved';
      }
    } catch (e) {
      if (isUserCancelError(e)) return 'cancelled';
      console.warn('[file:save] File System Access API failed, falling back:', e);
    }

    let downloadName = saveName;
    if (services.wasm.isNewDocument) {
      const result = await showSaveAs(saveBaseName(saveName, format), exported.extension);
      if (!result) return 'cancelled';
      downloadName = saveFileName(result, format);
      services.wasm.fileName = downloadName;
    }

    const url = URL.createObjectURL(exported.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    services.documentState.markClean('save');
    console.log(`[file:save] ${downloadName} (${(exported.bytes.length / 1024).toFixed(1)}KB)`);
    return 'saved';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[file:save] save failed:', msg);
    alert(`File save failed:\n${msg}`);
    return 'failed';
  }
}

export async function confirmSaveBeforeReplacingDocument(
  services: CommandServices,
): Promise<boolean> {
  const ctx = services.getContext();
  if (!ctx.hasDocument || !ctx.isDirty) return true;

  const choice = await showUnsavedChangesDialog({
    fileName: services.wasm.fileName,
    canSave: true,
  });

  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;

  const result = await saveCurrentDocument(services);
  return result === 'saved';
}

function appendPrintStyle(doc: Document, widthMm: number, heightMm: number): void {
  const style = doc.createElement('style');
  style.textContent = `
@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
* { margin: 0; padding: 0; }
body { background: #fff; }
.page { page-break-after: always; width: ${widthMm}mm; height: ${heightMm}mm; overflow: hidden; }
.page:last-child { page-break-after: auto; }
.page svg { width: 100%; height: 100%; }
@media screen {
  body { background: #e5e7eb; display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px; }
  .page { background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .print-bar { position: fixed; top: 0; left: 0; right: 0; background: #1e293b; color: #fff; padding: 8px 16px; display: flex; align-items: center; gap: 12px; font: 14px sans-serif; z-index: 100; }
  .print-bar button { padding: 6px 16px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
  .print-bar button:hover { background: #1d4ed8; }
  body { padding-top: 56px; }
}
@media print { .print-bar { display: none; } }
`;
  doc.head.appendChild(style);
}

function createPrintButton(doc: Document, id: string, label: string, background?: string): HTMLButtonElement {
  const button = doc.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = label;
  if (background) button.style.background = background;
  return button;
}

function appendSvgPage(doc: Document, container: HTMLElement, svg: string): void {
  const page = doc.createElement('div');
  page.className = 'page';

  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const parseError = parsed.querySelector('parsererror');
  if (parseError) {
    throw new Error(`인쇄용 SVG 파싱 실패: ${parseError.textContent || 'parsererror'}`);
  }

  page.appendChild(doc.importNode(parsed.documentElement, true));
  container.appendChild(page);
}

function setupPrintDocument(
  printWin: Window,
  fileName: string,
  pageCount: number,
  widthMm: number,
  heightMm: number,
  svgPages: string[],
): void {
  const doc = printWin.document;
  doc.documentElement.lang = 'ko';
  doc.title = `${fileName} — 인쇄`;

  doc.head.replaceChildren();
  const meta = doc.createElement('meta');
  meta.setAttribute('charset', 'UTF-8');
  doc.head.appendChild(meta);
  appendPrintStyle(doc, widthMm, heightMm);

  const printBar = doc.createElement('div');
  printBar.className = 'print-bar';
  const printButton = createPrintButton(doc, 'print-btn', '인쇄');
  const closeButton = createPrintButton(doc, 'close-btn', '닫기', '#475569');
  const title = doc.createElement('span');
  title.textContent = `${fileName} — ${pageCount}페이지`;
  printBar.append(printButton, closeButton, title);

  doc.body.replaceChildren(printBar);
  for (const svg of svgPages) {
    appendSvgPage(doc, doc.body, svg);
  }

  printButton.addEventListener('click', () => {
    printWin.print();
  });
  closeButton.addEventListener('click', () => {
    printWin.close();
  });
}

export const fileCommands: CommandDef[] = [
  {
    id: 'file:new-doc',
    label: '새로 만들기',
    icon: 'icon-new-doc',
    shortcutLabel: 'Alt+N',
    canExecute: () => true,
    execute(services) {
      services.eventBus.emit('create-new-document');
    },
  },
  {
    id: 'file:open',
    label: '열기',
    async execute(services) {
      try {
        const canReplace = await confirmSaveBeforeReplacingDocument(services);
        if (!canReplace) return;

        const handle = await pickOpenFileHandle(window as FileSystemWindowLike);
        if (!handle) {
          const fileInput = document.getElementById('file-input') as HTMLInputElement | null;
          if (fileInput) {
            fileInput.dataset.skipUnsavedGuard = 'true';
            fileInput.click();
          }
          return;
        }

        const { bytes, name } = await readFileFromHandle(handle);
        services.eventBus.emit('open-document-bytes', {
          bytes,
          fileName: name,
          fileHandle: handle,
          skipUnsavedGuard: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[file:open] 열기 실패:', msg);
        alert(`파일 열기에 실패했습니다:\n${msg}`);
      }
    },
  },
  {
    id: 'file:save',
    label: '저장',
    icon: 'icon-save',
    shortcutLabel: 'Ctrl+S',
    canExecute: (ctx) => ctx.hasDocument,
    async execute(services) {
      await saveCurrentDocument(services);
    },
  },
  {
    // [Task #833] 다른 이름으로 저장 — currentFileHandle 무시 + 항상 picker.
    id: 'file:save-as',
    label: '다른 이름으로 저장',
    shortcutLabel: 'Ctrl+Shift+S',
    canExecute: (ctx) => ctx.hasDocument,
    async execute(services) {
      try {
        const sourceFormat = services.wasm.getSourceFormat();
        const defaultFormat = defaultSaveFormat(sourceFormat, services.wasm.fileName);
        const saveName = saveFileName(services.wasm.fileName, defaultFormat);
        const windowLike = window as FileSystemWindowLike;

        try {
          if (windowLike.showSaveFilePicker) {
            const handle = await pickSaveFileHandle(windowLike, saveName, HWP_AND_HWPX_SAVE_PICKER_TYPES);
            if (!handle) return;

            const format = saveFormatForFileName(handle.name, defaultFormat);
            const exported = exportDocumentForSave(services, format);
            await writeBlobToHandle(handle, exported.blob);
            services.wasm.currentFileHandle = handle;
            services.wasm.fileName = saveFileName(handle.name, format);
            services.documentState.markClean('save-as');
            console.log(
              `[file:save-as] source=${sourceFormat}, format=${format}, ` +
              `reflowed=${exported.reflowedParagraphs}, ` +
              `${services.wasm.fileName} (${(exported.bytes.length / 1024).toFixed(1)}KB)`,
            );
            return;
          }
        } catch (e) {
          if (isUserCancelError(e)) return;
          console.warn('[file:save-as] File System Access API 실패, 폴백:', e);
        }

        // 폴백: 파일명 입력 → blob download
        const baseName = saveBaseName(saveName, defaultFormat);
        const result = await showSaveAs(baseName, extensionForFormat(defaultFormat), {
          allowFormatChoice: true,
        });
        if (!result) return;
        const format = saveFormatForFileName(result, defaultFormat);
        const exported = exportDocumentForSave(services, format);
        const downloadName = saveFileName(result, format);
        services.wasm.fileName = downloadName;

        const url = URL.createObjectURL(exported.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        services.documentState.markClean('save-as');
        console.log(
          `[file:save-as] source=${sourceFormat}, format=${format}, ` +
          `reflowed=${exported.reflowedParagraphs}, ` +
          `${downloadName} (${(exported.bytes.length / 1024).toFixed(1)}KB)`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[file:save-as] 저장 실패:', msg);
        alert(`파일 저장에 실패했습니다:\n${msg}`);
      }
    },
  },
  {
    id: 'file:page-setup',
    label: '편집 용지',
    icon: 'icon-page-setup',
    shortcutLabel: 'F7',
    canExecute: (ctx) => ctx.hasDocument,
    execute(services) {
      const dialog = new PageSetupDialog(services.wasm, services.eventBus, 0);
      dialog.show();
    },
  },
  {
    id: 'file:print',
    label: '인쇄',
    icon: 'icon-print',
    shortcutLabel: 'Ctrl+P',
    canExecute: (ctx) => ctx.hasDocument,
    async execute(services) {
      const wasm = services.wasm;
      const pageCount = wasm.pageCount;
      if (pageCount === 0) return;

      // 진행률 표시
      const statusEl = document.getElementById('sb-message');
      const origStatus = statusEl?.textContent || '';

      try {
        // SVG 페이지 생성
        const svgPages: string[] = [];
        for (let i = 0; i < pageCount; i++) {
          if (statusEl) statusEl.textContent = `인쇄 준비 중... (${i + 1}/${pageCount})`;
          const svg = wasm.renderPageSvg(i);
          svgPages.push(svg);
          // UI 갱신을 위한 양보
          if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }

        // 첫 페이지 정보로 용지 크기 결정
        const pageInfo = wasm.getPageInfo(0);
        const widthMm = Math.round(pageInfo.width * 25.4 / 96);
        const heightMm = Math.round(pageInfo.height * 25.4 / 96);

        // 인쇄 전용 창 생성
        const printWin = window.open('', '_blank');
        if (!printWin) {
          alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
          return;
        }

        setupPrintDocument(printWin, wasm.fileName, pageCount, widthMm, heightMm, svgPages);

        if (statusEl) statusEl.textContent = origStatus;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[file:print]', msg);
        if (statusEl) statusEl.textContent = `인쇄 실패: ${msg}`;
      }
    },
  },
  {
    id: 'file:about',
    label: '제품 정보',
    icon: 'icon-help',
    execute() {
      new AboutDialog().show();
    },
  },
];
