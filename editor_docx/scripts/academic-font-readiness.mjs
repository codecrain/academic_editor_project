import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_ACADEMIC_FONT_ROOT = '/usr/local/share/fonts/tlooto-academic';

export const REQUIRED_ACADEMIC_FONT_MATCHES = Object.freeze([
  Object.freeze({ requested: 'Times New Roman', accepted: Object.freeze(['Times New Roman']) }),
  Object.freeze({
    requested: 'Palatino Linotype',
    accepted: Object.freeze(['Palatino Linotype', 'TeX Gyre Pagella']),
  }),
  Object.freeze({
    requested: 'Cambria Math',
    accepted: Object.freeze(['Cambria Math', 'STIX Math', 'STIXMath', 'STIX Two Math']),
  }),
  Object.freeze({
    requested: 'Malgun Gothic',
    accepted: Object.freeze(['Malgun Gothic', 'Noto Sans CJK KR']),
  }),
  Object.freeze({
    requested: '맑은 고딕',
    accepted: Object.freeze(['맑은 고딕', 'Noto Sans CJK KR']),
  }),
  Object.freeze({
    requested: '나눔명조',
    accepted: Object.freeze(['나눔명조', 'NanumMyeongjo']),
  }),
  Object.freeze({
    requested: 'KoPub바탕체 Medium',
    accepted: Object.freeze(['KoPub바탕체 Medium', 'Noto Serif CJK KR']),
  }),
  Object.freeze({
    requested: 'Wingdings',
    accepted: Object.freeze(['Wingdings', 'Webdings']),
  }),
]);

function addResult(results, ok, label, detail = '') {
  results.push({ ok, label, detail });
}

function normalizeFamily(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function parseManifest(text) {
  const values = new Map();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return values;
}

function countFontFiles(directory) {
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      count += countFontFiles(entryPath);
    } else if (entry.isFile() && /\.(ttf|otf|ttc)$/i.test(entry.name)) {
      count += 1;
    }
  }
  return count;
}

function resolveFontRoot(fontRoot) {
  return String(
    fontRoot
      ?? process.env.EDITOR_ACADEMIC_FONTS_DIR
      ?? DEFAULT_ACADEMIC_FONT_ROOT,
  ).trim();
}

export function inspectAcademicFontReadiness(options = {}) {
  const fontRoot = resolveFontRoot(options.fontRoot);
  const runCommand = options.runCommand ?? spawnSync;
  const results = [];
  const manifestPath = path.join(fontRoot, 'INSTALL-MANIFEST.txt');

  let rootReady = false;
  try {
    rootReady = existsSync(fontRoot) && statSync(fontRoot).isDirectory();
  } catch {
    rootReady = false;
  }
  addResult(results, rootReady, 'academic font root', fontRoot);

  let manifest = new Map();
  const manifestReady = rootReady && existsSync(manifestPath);
  addResult(results, manifestReady, 'academic font manifest', manifestPath);
  if (manifestReady) {
    try {
      manifest = parseManifest(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      addResult(
        results,
        false,
        'academic font manifest readable',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const installComplete = manifest.get('install_complete') === 'yes';
  addResult(
    results,
    installComplete,
    'academic font install complete',
    `install_complete=${manifest.get('install_complete') ?? 'missing'}`,
  );

  const eulaAccepted = manifest.get('microsoft_core_fonts_eula_accepted') === 'yes';
  addResult(
    results,
    eulaAccepted,
    'Microsoft Core Fonts manifest consent',
    `microsoft_core_fonts_eula_accepted=${manifest.get('microsoft_core_fonts_eula_accepted') ?? 'missing'}`,
  );

  let actualFontFiles = 0;
  if (rootReady) {
    try {
      actualFontFiles = countFontFiles(fontRoot);
    } catch {
      actualFontFiles = 0;
    }
  }
  const manifestFontFiles = Number.parseInt(manifest.get('font_files') ?? '', 10);
  addResult(
    results,
    actualFontFiles > 0 && Number.isFinite(manifestFontFiles) && actualFontFiles === manifestFontFiles,
    'academic font manifest file count',
    `manifest=${Number.isFinite(manifestFontFiles) ? manifestFontFiles : 'missing'}, actual=${actualFontFiles}`,
  );

  for (const requirement of REQUIRED_ACADEMIC_FONT_MATCHES) {
    const match = runCommand(
      'fc-match',
      ['-f', '%{family[0]}', requirement.requested],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 3_000 },
    );
    const actual = String(match.stdout ?? '').trim();
    const accepted = new Set(requirement.accepted.map(normalizeFamily));
    const ok = match.status === 0 && accepted.has(normalizeFamily(actual));
    const errorDetail = String(match.stderr ?? '').trim();
    addResult(
      results,
      ok,
      `font match ${requirement.requested}`,
      actual
        ? `${actual} (accepted: ${requirement.accepted.join(' | ')})`
        : errorDetail || 'fc-match returned no family',
    );
  }

  return {
    ok: results.every((result) => result.ok),
    fontRoot,
    manifestPath,
    results,
  };
}

export function assertAcademicFontReadiness(options = {}) {
  const status = inspectAcademicFontReadiness(options);
  if (!status.ok) {
    const failures = status.results
      .filter((result) => !result.ok)
      .map((result) => `${result.label}: ${result.detail}`)
      .join('; ');
    throw new Error(
      `Academic DOCX fonts are not ready (${failures}). Run npm run fonts:academic, then retry.`,
    );
  }
  return status;
}
