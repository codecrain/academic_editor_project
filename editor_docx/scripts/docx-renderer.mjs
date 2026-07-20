import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_HELPER_PATH = path.join(__dirname, 'render-docx-uno.py');
const DEFAULT_UNO_PYTHON = process.platform === 'linux'
  ? '/opt/collaboraoffice/program/python'
  : 'python';
const DEFAULT_SOFFICE = process.platform === 'linux'
  ? '/opt/collaboraoffice/program/soffice'
  : 'soffice';
const MAX_PROCESS_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_RESULT_BYTES = 64 * 1024 * 1024;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function terminateOwnedProcess(child, signal = 'SIGTERM') {
  if (!child?.pid || child.exitCode !== null) {
    return;
  }
  try {
    if (process.platform !== 'win32') {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The owned process already exited.
    }
  }
}

function runOwnedProcess(command, args, options = {}) {
  const timeoutMs = Math.max(1_000, Number(options.timeoutMs || 210_000));
  const killGraceMs = Math.max(5_000, Number(options.killGraceMs || 15_000));
  const maxOutputBytes = Math.max(1_024, Number(options.maxOutputBytes || MAX_PROCESS_OUTPUT_BYTES));
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let timedOut = false;
    let settled = false;

    const hardKill = () => terminateOwnedProcess(child, 'SIGKILL');
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateOwnedProcess(child, 'SIGTERM');
      const killTimer = setTimeout(hardKill, killGraceMs);
      killTimer.unref?.();
    }, timeoutMs);
    timeout.unref?.();

    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        terminateOwnedProcess(child, 'SIGTERM');
        return;
      }
      target.push(Buffer.from(chunk));
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.once('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      const stdoutText = Buffer.concat(stdout).toString('utf8').trim();
      const stderrText = Buffer.concat(stderr).toString('utf8').trim();
      if (timedOut) {
        reject(new Error(`DOCX renderer timed out after ${timeoutMs} ms.`));
        return;
      }
      if (outputBytes > maxOutputBytes) {
        reject(new Error('DOCX renderer process output exceeded the configured limit.'));
        return;
      }
      if (code !== 0) {
        reject(new Error(`DOCX renderer failed with exit ${code}${signal ? ` (${signal})` : ''}: ${stderrText || stdoutText || 'no diagnostic output'}`));
        return;
      }
      resolve({ stdout: stdoutText, stderr: stderrText, code });
    });
  });
}

function normalizeSelectedPages(pages) {
  if (pages === undefined || pages === null || pages === 'all') {
    return null;
  }
  if (pages === 'none') {
    return [];
  }
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error('pages must be a non-empty array of positive page numbers or "all".');
  }
  const normalized = [...new Set(pages.map((page) => Number(page)))].sort((a, b) => a - b);
  if (normalized.some((page) => !Number.isInteger(page) || page < 1)) {
    throw new Error('pages must contain only positive integers.');
  }
  return normalized;
}

function assertInsideDirectory(root, candidatePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.isAbsolute(String(candidatePath || ''))
    ? path.resolve(String(candidatePath))
    : path.resolve(resolvedRoot, String(candidatePath || ''));
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('DOCX renderer returned a file outside its isolated output directory.');
  }
  return resolved;
}

async function readVerifiedOutput(root, descriptor, kind) {
  const outputPath = assertInsideDirectory(root, descriptor?.path);
  const bytes = await readFile(outputPath);
  const actualSha256 = sha256(bytes);
  if (descriptor?.sha256 && String(descriptor.sha256).toLowerCase() !== actualSha256) {
    throw new Error(`DOCX renderer ${kind} SHA-256 mismatch.`);
  }
  if (Number.isFinite(Number(descriptor?.bytes)) && Number(descriptor.bytes) !== bytes.length) {
    throw new Error(`DOCX renderer ${kind} byte length mismatch.`);
  }
  if (kind === 'PDF' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('DOCX renderer returned an invalid PDF signature.');
  }
  if (kind === 'WebP' && !(bytes.subarray(0, 4).equals(Buffer.from('RIFF')) && bytes.subarray(8, 12).equals(Buffer.from('WEBP')))) {
    throw new Error('DOCX renderer returned an invalid WebP signature.');
  }
  return { bytes, sha256: actualSha256, byteLength: bytes.length };
}

async function renderDocxWithUno(docxBytes, options = {}) {
  const sourceBytes = Buffer.from(docxBytes || []);
  if (sourceBytes.length < 4 || !sourceBytes.subarray(0, 2).equals(Buffer.from('PK'))) {
    throw new Error('DOCX renderer requires a readable DOCX package.');
  }
  const selectedPages = normalizeSelectedPages(options.pages);
  const quality = Math.round(Math.max(0, Math.min(100, Number(options.quality ?? 20))));
  const maxSize = Math.round(Math.max(100, Math.min(4_000, Number(options.maxSize ?? 1_700))));
  const operationTimeoutSeconds = Math.round(Math.max(10, Math.min(600, Number(options.operationTimeoutSeconds ?? 180))));
  const timeoutMs = Math.max(operationTimeoutSeconds * 1_000 + 30_000, Number(options.timeoutMs || 0));
  const maxResultBytes = Math.max(1_024 * 1_024, Number(options.maxResultBytes || DEFAULT_MAX_RESULT_BYTES));
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'academic-editor-docx-render-'));
  const sourcePath = path.join(tempRoot, 'source.docx');
  const outputDir = path.join(tempRoot, 'output');

  try {
    await mkdir(outputDir, { recursive: true });
    await writeFile(sourcePath, sourceBytes);
    const args = [
      options.helperPath || DEFAULT_HELPER_PATH,
      sourcePath,
      outputDir,
      '--pages', selectedPages === null ? 'all' : selectedPages.length ? selectedPages.join(',') : 'none',
      '--quality', String(quality),
      '--max-size', String(maxSize),
      '--connect-timeout', String(options.connectTimeoutSeconds ?? 20),
      '--operation-timeout', String(operationTimeoutSeconds),
      '--shutdown-timeout', String(options.shutdownTimeoutSeconds ?? 10),
      '--soffice', options.sofficeBin || DEFAULT_SOFFICE,
    ];
    const completed = await (options.runProcess || runOwnedProcess)(
      options.pythonBin || DEFAULT_UNO_PYTHON,
      args,
      { timeoutMs },
    );
    let manifest;
    try {
      manifest = JSON.parse(String(completed.stdout || '').trim());
    } catch (error) {
      throw new Error(`DOCX renderer returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (manifest?.ok !== true) {
      throw new Error(`DOCX renderer reported failure: ${manifest?.message || manifest?.error || 'unknown error'}`);
    }
    if (Number(manifest?.cleanup?.remainingOfficePids || 0) !== 0) {
      throw new Error('DOCX renderer left an owned office process running.');
    }
    if (manifest?.cleanup?.profileRemoved !== true) {
      throw new Error('DOCX renderer did not remove its isolated office profile.');
    }
    const pdfOutput = await readVerifiedOutput(outputDir, manifest.pdf, 'PDF');
    const pages = [];
    let totalBytes = pdfOutput.byteLength;
    for (const descriptor of manifest.pages || []) {
      const page = Number(descriptor.page);
      if (!Number.isInteger(page) || page < 1) {
        throw new Error('DOCX renderer returned an invalid page number.');
      }
      const verified = await readVerifiedOutput(outputDir, descriptor, 'WebP');
      totalBytes += verified.byteLength;
      pages.push({
        page,
        format: 'webp',
        mimeType: 'image/webp',
        width: Number(descriptor.width),
        height: Number(descriptor.height),
        quality: Number(descriptor.quality ?? quality),
        ...verified,
      });
    }
    if (totalBytes > maxResultBytes) {
      throw new Error(`DOCX rendered output exceeded ${maxResultBytes} bytes.`);
    }
    if (selectedPages !== null && (pages.length !== selectedPages.length || pages.some((entry, index) => entry.page !== selectedPages[index]))) {
      throw new Error('DOCX renderer did not return every selected page exactly once.');
    }
    return {
      ok: true,
      renderer: String(manifest.renderer || 'collabora-uno-webp'),
      pageCount: Number(manifest.pageCount),
      selectedPages: pages.map((entry) => entry.page),
      settings: {
        format: 'webp',
        quality,
        maxWidth: maxSize,
        maxHeight: maxSize,
        background: 'white',
        metadata: 'stripped',
        ...(manifest.settings || {}),
      },
      pdf: { mimeType: 'application/pdf', ...pdfOutput },
      pages,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export {
  DEFAULT_HELPER_PATH,
  normalizeSelectedPages,
  renderDocxWithUno,
  runOwnedProcess,
};
