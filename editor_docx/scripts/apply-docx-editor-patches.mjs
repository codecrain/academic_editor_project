import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const patchScript = path.resolve(repoRoot, 'branding', 'debrand-online.sh');

function usage() {
  return 'Usage: node editor_docx/scripts/apply-docx-editor-patches.mjs /path/to/editor_docx';
}

function runQuiet(command, args) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    windowsHide: true,
  });
}

function pythonCommand() {
  const candidates = [
    process.env.PYTHON_BIN,
    process.platform === 'win32' ? 'python' : 'python3',
    'python3',
    'python',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const probe = runQuiet(candidate, ['--version']);
    if (probe.status === 0) {
      return candidate;
    }
  }

  throw new Error('python3 or python is required to apply DOCX editor patches.');
}

function extractPythonBlocks(scriptText) {
  const normalized = scriptText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const pattern = /"\$\{PYTHON_BIN\}"\s+-\s+"\$\{ROOT_DIR\}"\s+<<'PY'\n([\s\S]*?)\nPY/g;
  return [...normalized.matchAll(pattern)].map((match) => match[1]);
}

function runPythonBlock(command, code, target, index) {
  const result = spawnSync(command, ['-', target], {
    cwd: repoRoot,
    input: code,
    stdio: ['pipe', 'inherit', 'inherit'],
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`DOCX editor patch block ${index + 1} failed.`);
  }
}

function shouldSkipFile(filePath) {
  const name = path.basename(filePath);
  return (
    name.endsWith('.md') ||
    name.startsWith('COPYING') ||
    name.startsWith('LICENSE')
  );
}

function* walkFiles(root) {
  if (!existsSync(root)) {
    return;
  }
  for (const entry of readdirSync(root)) {
    if (entry === '.git') {
      continue;
    }
    const child = path.join(root, entry);
    const stat = lstatSync(child);
    if (stat.isDirectory()) {
      yield* walkFiles(child);
    } else if (stat.isFile() && !shouldSkipFile(child)) {
      yield child;
    }
  }
}

function scanForTrademarkStrings(target) {
  const trademarkPattern =
    /Collabora Online Development Edition|Collabora Online Welcome|Collabora Office|Oops, there is a problem connecting to Collabora Online|Your Collabora Online server needs updating|collabora-office-white\.svg|CollaboraOnline|collaboraonline|collaboraoffice/;
  const findings = [];

  for (const scanRoot of [path.join(target, 'browser'), path.join(target, 'wsd')]) {
    for (const filePath of walkFiles(scanRoot)) {
      let text;
      try {
        text = readFileSync(filePath).toString('utf8');
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (trademarkPattern.test(lines[index])) {
          findings.push(
            `${path.relative(target, filePath)}:${index + 1}: ${lines[index].trim()}`,
          );
          break;
        }
      }
    }
  }

  if (findings.length > 0) {
    const preview = findings.slice(0, 80).join('\n');
    const suffix = findings.length > 80 ? `\n... ${findings.length - 80} more` : '';
    throw new Error(
      `[debrand] user-facing trademark strings remain in browser/wsd sources:\n${preview}${suffix}`,
    );
  }
}

function main() {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : '';
  if (!target || !existsSync(target) || !lstatSync(target).isDirectory()) {
    throw new Error(usage());
  }

  const scriptText = readFileSync(patchScript, 'utf8');
  const pythonBlocks = extractPythonBlocks(scriptText);
  if (pythonBlocks.length === 0) {
    throw new Error(`No Python patch blocks found in ${patchScript}`);
  }

  const command = pythonCommand();
  for (const [index, code] of pythonBlocks.entries()) {
    runPythonBlock(command, code, target, index);
  }
  scanForTrademarkStrings(target);
  console.log('[debrand] user-facing editor branding patch applied.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
