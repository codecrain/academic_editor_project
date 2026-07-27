import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

async function listModules(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.build') continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listModules(target));
    } else if (entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')) {
      files.push(target);
    }
  }
  return files;
}

function moduleSpecifiers(source) {
  return [...source.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1]);
}

async function reserveTcpPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForOutput(child, expected, timeoutMs = 10_000) {
  let output = '';
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`timed out waiting for ${JSON.stringify(expected)}; output: ${output}`));
    }, timeoutMs);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes(expected)) {
        clearTimeout(timeout);
        resolve(output);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`gateway wrapper exited before startup (code=${code}, signal=${signal}); output: ${output}`));
    });
  });
}

test('format engines never import the opposite format engine', async () => {
  for (const [root, forbidden] of [
    [path.resolve('editor_docx'), 'editor_hwpx'],
    [path.resolve('editor_hwpx'), 'editor_docx'],
  ]) {
    for (const file of await listModules(root)) {
      const imports = moduleSpecifiers(await readFile(file, 'utf8'));
      assert.equal(
        imports.some((specifier) => specifier.includes(forbidden)),
        false,
        `${path.relative(process.cwd(), file)} must not import ${forbidden}`,
      );
    }
  }
});

test('shared server reaches format engines only through format adapters', async () => {
  const serverRoot = path.resolve('editor_server');
  for (const file of await listModules(serverRoot)) {
    if (file.includes(`${path.sep}format-adapters${path.sep}`)) continue;
    const imports = moduleSpecifiers(await readFile(file, 'utf8'));
    assert.equal(
      imports.some((specifier) => /editor_(?:docx|hwpx)/.test(specifier)),
      false,
      `${path.relative(process.cwd(), file)} must depend on a format adapter`,
    );
  }
});

test('public compatibility wrappers delegate to shared modules without cloning implementations', async () => {
  const wrappers = [
    {
      path: path.resolve('editor_docx/scripts/editor-gateway.mjs'),
      sharedPath: path.resolve('editor_server/editor-gateway.mjs'),
      sharedSpecifier: '../../editor_server/editor-gateway.mjs',
      allowedSpecifiers: new Set([
        'node:path',
        'node:url',
        '../../editor_server/editor-gateway.mjs',
      ]),
    },
    {
      path: path.resolve('editor_docx/scripts/editor-mcp.mjs'),
      sharedPath: path.resolve('editor_server/editor-mcp.mjs'),
      sharedSpecifier: '../../editor_server/editor-mcp.mjs',
      allowedSpecifiers: new Set(['../../editor_server/editor-mcp.mjs']),
    },
    {
      path: path.resolve('editor_hwpx/scripts/hwpx-mcp-tools.mjs'),
      sharedPath: path.resolve('editor_server/editor-mcp.mjs'),
      sharedSpecifier: '../../editor_server/editor-mcp.mjs',
      allowedSpecifiers: new Set(['../../editor_server/editor-mcp.mjs']),
      publicExports: ['HWPX_MCP_TOOLS'],
    },
  ];
  for (const wrapper of wrappers) {
    const source = await readFile(wrapper.path, 'utf8');
    const specifiers = moduleSpecifiers(source);
    assert.ok(
      specifiers.includes(wrapper.sharedSpecifier),
      `${path.relative(process.cwd(), wrapper.path)} must delegate to ${wrapper.sharedSpecifier}`,
    );
    assert.deepEqual(
      specifiers.filter((specifier) => !wrapper.allowedSpecifiers.has(specifier)),
      [],
      `${path.relative(process.cwd(), wrapper.path)} must not import another implementation`,
    );

    const wrapperModule = await import(pathToFileURL(wrapper.path).href);
    const sharedModule = await import(pathToFileURL(wrapper.sharedPath).href);
    const expectedExports = wrapper.publicExports ?? Object.keys(sharedModule).sort();
    assert.deepEqual(Object.keys(wrapperModule).sort(), expectedExports);
    for (const exportName of expectedExports) {
      assert.strictEqual(wrapperModule[exportName], sharedModule[exportName]);
    }
  }

  const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));
  assert.equal(pkg.scripts['start:gateway'], 'node editor_server/editor-gateway.mjs');
  assert.match(pkg.scripts['test:runtime'], /editor_server\/editor-gateway\.test\.mjs/);
  assert.match(pkg.scripts['test:runtime'], /editor_server\/editor-mcp\.test\.mjs/);
});

test('the public gateway wrapper starts the shared gateway when executed directly', async () => {
  const port = await reserveTcpPort();
  const documentRoot = await mkdtemp(path.join(os.tmpdir(), 'academic-editor-wrapper-'));
  const child = spawn(process.execPath, ['editor_docx/scripts/editor-gateway.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      EDITOR_GATEWAY_HOST: '127.0.0.1',
      EDITOR_GATEWAY_PORT: String(port),
      EDITOR_GATEWAY_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
      EDITOR_DOCUMENT_ROOT: documentRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const output = await waitForOutput(child, `[editor:gateway] MCP: http://127.0.0.1:${port}/mcp`);
    assert.match(output, new RegExp(`\\[editor:gateway\\] ready: http://127\\.0\\.0\\.1:${port}`));
    assert.match(output, new RegExp(`\\[editor:gateway\\] MCP: http://127\\.0\\.0\\.1:${port}/mcp`));
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    await rm(documentRoot, { recursive: true, force: true });
  }
});

test('runtime and evaluation entrypoints reference only the canonical shared server modules', async () => {
  const checkedFiles = [
    path.resolve('editor_docx/scripts/docx-command-catalog.test.mjs'),
    path.resolve('editor_docx/scripts/live-paper-command-matrix.mjs'),
    path.resolve('editor_common/scripts/start-local-editors.mjs'),
    path.resolve('evaluation/docs-workspace-v1/start-isolated-gateway.mjs'),
  ];
  for (const file of checkedFiles) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(
      source,
      /editor_docx[\\/]scripts[\\/]editor-(?:gateway|mcp)\.mjs|\.\/editor-mcp\.mjs/,
      `${path.relative(process.cwd(), file)} must reference editor_server`,
    );
  }
});

test('evaluation code uses public format modules instead of installed dependency internals', async () => {
  const evaluationRoot = path.resolve('evaluation');
  for (const file of await listModules(evaluationRoot)) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(
      source,
      /editor_(?:docx|hwpx)\/node_modules\//,
      `${path.relative(process.cwd(), file)} must not import an installed dependency by path`,
    );
  }
});
