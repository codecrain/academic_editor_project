import assert from 'node:assert/strict';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { renderHwpxPdf } from './hwpx-native-pdf.mjs';

const HWPX_BYTES = Buffer.from('PK\x03\x04minimal-hwpx-package');
const PDF_BYTES = Buffer.from('%PDF-1.7\n%%EOF\n');

function fakeDockerProcess(options = {}) {
  const calls = [];
  const runProcess = (command, args, processOptions = {}) => {
    calls.push({ command, args, processOptions });
    if (args[0] === 'rm') {
      return Promise.resolve({ code: 0, stdout: '', stderr: '' });
    }
    if (options.neverSettles) {
      const pending = new Promise(() => {});
      pending.terminate = () => { options.onTerminate?.(processOptions.containerName); };
      return pending;
    }
    return (async () => {
      if (options.outputBytes !== undefined) {
        await writeFile(path.join(processOptions.requestDir, 'output.pdf'), options.outputBytes);
      }
      return {
        code: options.code ?? 0,
        stdout: options.stdout ?? JSON.stringify({ ok: true, pageCount: options.pageCount ?? 2, renderer: 'rhwp-native' }),
        stderr: options.stderr ?? '',
      };
    })();
  };
  return { runProcess, calls };
}

test('HWPX native PDF runner returns verified metadata from an isolated request', async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hwpx-native-pdf-test-'));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const process = fakeDockerProcess({ outputBytes: PDF_BYTES, pageCount: 2 });
  let requestDir = '';

  const result = await renderHwpxPdf(HWPX_BYTES, {
    tempRoot,
    dockerImage: 'academic-rhwp-pdf:test',
    runProcess: async (command, args, options) => {
      requestDir = options.requestDir ?? requestDir;
      return process.runProcess(command, args, options);
    },
  });

  assert.equal(result.bytes.compare(PDF_BYTES), 0);
  assert.equal(result.byteLength, PDF_BYTES.length);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.pageCount, 2);
  assert.equal(result.renderer, 'rhwp-native');
  const dockerRun = process.calls.find(({ args }) => args[0] === 'run');
  assert.deepEqual(dockerRun.args.slice(-5), ['export-pdf', '/work/input.hwpx', '-o', '/work/output.pdf', '--json']);
  assert.match(dockerRun.processOptions.containerName, /^academic-hwpx-pdf-/);
  await assert.rejects(access(requestDir));
  await access(tempRoot);
});

test('HWPX native PDF runner rejects malformed PDF output and removes its request directory', async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hwpx-native-pdf-test-'));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const process = fakeDockerProcess({ outputBytes: Buffer.from('not-a-pdf') });
  let requestDir = '';

  await assert.rejects(
    renderHwpxPdf(HWPX_BYTES, {
      tempRoot,
      runProcess: async (command, args, options) => {
        requestDir = options.requestDir ?? requestDir;
        return process.runProcess(command, args, options);
      },
    }),
    /invalid PDF signature/,
  );
  await assert.rejects(access(requestDir));
  await access(tempRoot);
});

test('HWPX native PDF runner rejects non-zero exits and cleans only its owned container', async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hwpx-native-pdf-test-'));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const process = fakeDockerProcess({ code: 17, stderr: 'native conversion failed' });

  await assert.rejects(
    renderHwpxPdf(HWPX_BYTES, { tempRoot, runProcess: process.runProcess }),
    /exit 17.*native conversion failed/,
  );
  const cleanup = process.calls.find(({ args }) => args[0] === 'rm');
  assert.deepEqual(cleanup.args.slice(0, 2), ['rm', '-f']);
  assert.match(cleanup.args[2], /^academic-hwpx-pdf-/);
  assert.equal(process.calls.filter(({ args }) => args[0] === 'ps').length, 0);
  await access(tempRoot);
});

test('HWPX native PDF runner terminates only the timed-out request and cleans it up', async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hwpx-native-pdf-test-'));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  let terminatedName = '';
  const process = fakeDockerProcess({
    neverSettles: true,
    onTerminate: (name) => { terminatedName = name; },
  });

  await assert.rejects(
    renderHwpxPdf(HWPX_BYTES, { tempRoot, timeoutMs: 20, runProcess: process.runProcess }),
    /timed out after 20 ms/,
  );
  assert.match(terminatedName, /^academic-hwpx-pdf-/);
  const cleanup = process.calls.find(({ args }) => args[0] === 'rm');
  assert.equal(cleanup.args[2], terminatedName);
  await access(tempRoot);
});

test('HWPX native PDF runner validates HWPX bytes and full-document pages input', async () => {
  assert.throws(() => renderHwpxPdf(Buffer.from('not-a-zip')), /readable HWPX package/);
  assert.throws(() => renderHwpxPdf(HWPX_BYTES, { pages: [] }), /"all" or omitted/);
  assert.throws(() => renderHwpxPdf(HWPX_BYTES, { pages: [1] }), /"all" or omitted/);
});
