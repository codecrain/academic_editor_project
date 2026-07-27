import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const blockedPathPatterns = [
  /^\.env(?:\.|$)/,
  /^\.idea\//,
  /^\.vscode\//,
  /(^|\/)(secrets|credentials)\//,
  /\.(pem|key|p12|pfx|jks|keystore|token|secret)$/i,
];

const blockedContentPatterns = [
  { name: 'OpenAI/API key prefix', pattern: /\b(sk|pk|sess|org|proj)-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: 'hard-coded credential value', pattern: /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key)\s*[:=]\s*['"][^'"]{12,}['"]/i },
  { name: 'blocked CODE image default', pattern: /(?:\$\{EDITOR_IMAGE:-|^\s*image:\s*)collabora\/code(?::[A-Za-z0-9_.-]+)?\b/im },
];

const vendoredSourcePatterns = [
  /^editor_docx\//,
  /^editor_hwpx\//,
];

function isVendoredSource(normalizedPath) {
  return vendoredSourcePatterns.some((pattern) => pattern.test(normalizedPath));
}

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function getTrackedAndUntrackedFiles() {
  const output = runGit(['ls-files', '--cached', '--others', '--exclude-standard']);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^"?(.+?)"?$/, '$1'))
    .filter((file) => !file.includes(' -> '));
}

function main() {
  const files = getTrackedAndUntrackedFiles();
  const failures = [];
  let skippedVendoredFiles = 0;

  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');
    if (isVendoredSource(normalized)) {
      skippedVendoredFiles += 1;
      continue;
    }

    for (const pattern of blockedPathPatterns) {
      if (pattern.test(normalized)) {
        failures.push(`${file}: blocked public path`);
      }
    }

    let text = '';
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const check of blockedContentPatterns) {
      if (check.pattern.test(text)) {
        failures.push(`${file}: ${check.name}`);
      }
    }
  }

  if (failures.length) {
    console.error('[verify:public] failed');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `[verify:public] ok (${files.length - skippedVendoredFiles} repository-owned files checked, ${skippedVendoredFiles} vendored source files skipped)`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
