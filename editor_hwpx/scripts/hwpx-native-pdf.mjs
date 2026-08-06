import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_DOCKER_IMAGE = 'academic-rhwp-pdf:latest';
const DEFAULT_TIMEOUT_MS = 210_000;
const MAX_PROCESS_OUTPUT_BYTES = 2 * 1024 * 1024;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizePages(pages) {
  if (pages === undefined || pages === null || pages === 'all') {
    return;
  }
  throw new Error('HWPX native PDF renderer supports pages="all" or omitted only.');
}

function assertHwpxBytes(bytes) {
  const source = Buffer.from(bytes ?? []);
  if (source.length < 4 || !source.subarray(0, 4).equals(Buffer.from('PK\x03\x04'))) {
    throw new Error('HWPX native PDF renderer requires a readable HWPX package (ZIP magic PK\\x03\\x04).');
  }
  return source;
}

function terminateOwnedProcess(child) {
  if (!child || child.exitCode !== null) return;
  try {
    child.kill('SIGTERM');
  } catch {
    // The request-owned Docker client already exited.
  }
}

function runOwnedProcess(command, args, options = {}) {
  let child;
  const completion = new Promise((resolve, reject) => {
    child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) {
        terminateOwnedProcess(child);
        return;
      }
      target.push(Buffer.from(chunk));
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) {
        reject(new Error('HWPX native PDF renderer process output exceeded the configured limit.'));
        return;
      }
      resolve({
        code: Number(code ?? 1),
        signal,
        stdout: Buffer.concat(stdout).toString('utf8').trim(),
        stderr: Buffer.concat(stderr).toString('utf8').trim(),
      });
    });
  });
  completion.terminate = () => terminateOwnedProcess(child);
  return completion;
}

async function awaitOwnedProcess(started, timeoutMs) {
  const completion = started?.promise ?? started;
  if (!completion || typeof completion.then !== 'function') {
    throw new Error('runProcess must return a promise or an object with a promise.');
  }
  const terminate = started?.terminate ?? completion.terminate;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        terminate?.();
      } finally {
        reject(new Error(`HWPX native PDF renderer timed out after ${timeoutMs} ms.`));
      }
    }, timeoutMs);
    Promise.resolve(completion).then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function parseSuccessJson(stdout) {
  try {
    const result = JSON.parse(String(stdout ?? '').trim());
    if (result?.ok !== true) {
      throw new Error(result?.error || result?.message || 'native CLI reported failure');
    }
    const pageCount = Number(result.pageCount);
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new Error('native CLI returned an invalid pageCount');
    }
    return { pageCount, renderer: String(result.renderer || '') };
  } catch (error) {
    throw new Error(`HWPX native PDF renderer returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function renderHwpxPdf(bytes, options = {}) {
  const sourceBytes = assertHwpxBytes(bytes);
  normalizePages(options.pages);
  return renderHwpxPdfAsync(sourceBytes, options);
}

async function renderHwpxPdfAsync(sourceBytes, options) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const tempRoot = path.resolve(options.tempRoot || os.tmpdir());
  const dockerImage = String(options.dockerImage || DEFAULT_DOCKER_IMAGE);
  const runProcess = options.runProcess || runOwnedProcess;
  const containerName = `academic-hwpx-pdf-${randomUUID().replaceAll('-', '')}`;
  await mkdir(tempRoot, { recursive: true });
  const requestDir = await mkdtemp(path.join(tempRoot, 'academic-hwpx-pdf-'));
  const inputPath = path.join(requestDir, 'input.hwpx');
  const outputPath = path.join(requestDir, 'output.pdf');

  try {
    await writeFile(inputPath, sourceBytes);
    const args = [
      'run', '--rm', '--name', containerName,
      '-v', `${requestDir}:/work`,
      dockerImage,
      'export-pdf', '/work/input.hwpx', '-o', '/work/output.pdf', '--json',
    ];
    const completed = await awaitOwnedProcess(
      runProcess('docker', args, { timeoutMs, requestDir, containerName }),
      timeoutMs,
    );
    if (Number(completed?.code) !== 0) {
      throw new Error(`HWPX native PDF renderer failed with exit ${completed?.code}: ${completed?.stderr || completed?.stdout || 'no diagnostic output'}`);
    }
    const cliResult = parseSuccessJson(completed.stdout);
    const pdfBytes = await readFile(outputPath);
    if (!pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('HWPX native PDF renderer returned an invalid PDF signature.');
    }
    return {
      bytes: pdfBytes,
      sha256: sha256(pdfBytes),
      byteLength: pdfBytes.length,
      pageCount: cliResult.pageCount,
      renderer: 'rhwp-native',
    };
  } finally {
    try {
      await Promise.resolve(runProcess('docker', ['rm', '-f', containerName], { containerName, requestDir }));
    } catch {
      // --rm normally removed the request-owned container already.
    }
    await rm(requestDir, { recursive: true, force: true });
  }
}

export {
  normalizePages,
  renderHwpxPdf,
  runOwnedProcess,
};
