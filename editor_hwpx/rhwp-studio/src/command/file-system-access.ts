export interface FileSystemWritableFileStreamLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

export interface FileSystemFileHandleLike {
  kind?: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
}

export interface FileSystemWindowLike {
  showOpenFilePicker?: (options?: {
    excludeAcceptAllOption?: boolean;
    multiple?: boolean;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandleLike[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandleLike>;
}

export interface FileHandleReadResult {
  name: string;
  bytes: Uint8Array;
}

export interface SaveDocumentOptions {
  blob: Blob;
  suggestedName: string;
  currentHandle: FileSystemFileHandleLike | null;
  windowLike: FileSystemWindowLike;
  saveTypes?: { description: string; accept: Record<string, string[]> }[];
  /** [Task #833] true 시 currentHandle 무시 + 항상 showSaveFilePicker 호출 (다른 이름으로 저장). */
  forceSaveAs?: boolean;
}

export interface SaveDocumentResult {
  method: 'current-handle' | 'save-picker' | 'fallback';
  handle: FileSystemFileHandleLike | null;
  fileName: string;
}

const HWP_OPEN_PICKER_TYPES = [{
  description: 'HWP/HWPX 문서',
  accept: { 'application/x-hwp': ['.hwp', '.hwpx'] },
}];

export const HWP_SAVE_PICKER_TYPES = [{
  description: 'HWP 문서',
  accept: { 'application/x-hwp': ['.hwp'] },
}];

export const HWPX_SAVE_PICKER_TYPES = [{
  description: 'HWPX 문서',
  accept: { 'application/hwp+zip': ['.hwpx'] },
}];

export const HWP_AND_HWPX_SAVE_PICKER_TYPES = [
  ...HWPX_SAVE_PICKER_TYPES,
  ...HWP_SAVE_PICKER_TYPES,
];

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export async function writeBlobToHandle(handle: FileSystemFileHandleLike, blob: Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function pickSaveFileHandle(
  windowLike: FileSystemWindowLike,
  suggestedName: string,
  saveTypes: { description: string; accept: Record<string, string[]> }[],
): Promise<FileSystemFileHandleLike | null> {
  if (!windowLike.showSaveFilePicker) return null;

  try {
    return await windowLike.showSaveFilePicker({
      suggestedName,
      types: saveTypes,
    });
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
}

export async function pickOpenFileHandle(windowLike: FileSystemWindowLike): Promise<FileSystemFileHandleLike | null> {
  if (!windowLike.showOpenFilePicker) return null;

  try {
    const handles = await windowLike.showOpenFilePicker({
      excludeAcceptAllOption: true,
      multiple: false,
      types: HWP_OPEN_PICKER_TYPES,
    });
    return handles[0] ?? null;
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
}

export async function readFileFromHandle(handle: FileSystemFileHandleLike): Promise<FileHandleReadResult> {
  const file = await handle.getFile();
  return {
    name: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}

export async function saveDocumentToFileSystem(options: SaveDocumentOptions): Promise<SaveDocumentResult> {
  const { blob, suggestedName, currentHandle, windowLike, saveTypes, forceSaveAs } = options;

  // [Task #833] forceSaveAs 시 currentHandle 우회 → 항상 picker (다른 이름으로 저장).
  if (currentHandle && !forceSaveAs) {
    await writeBlobToHandle(currentHandle, blob);
    return {
      method: 'current-handle',
      handle: currentHandle,
      fileName: currentHandle.name,
    };
  }

  if (windowLike.showSaveFilePicker) {
    const handle = await windowLike.showSaveFilePicker({
      suggestedName,
      types: saveTypes ?? HWP_SAVE_PICKER_TYPES,
    });
    await writeBlobToHandle(handle, blob);
    return {
      method: 'save-picker',
      handle,
      fileName: handle.name,
    };
  }

  return {
    method: 'fallback',
    handle: null,
    fileName: suggestedName,
  };
}
