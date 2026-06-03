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

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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

  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');
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

  console.log(`[verify:public] ok (${files.length} changed/public candidate files checked)`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
