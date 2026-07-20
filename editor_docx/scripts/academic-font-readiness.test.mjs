import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertAcademicFontReadiness,
  inspectAcademicFontReadiness,
} from './academic-font-readiness.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readProjectFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function createFontFixture({ installComplete = true, manifestCount = 4 } = {}) {
  const fontRoot = mkdtempSync(path.join(tmpdir(), 'academic-font-readiness-'));
  const fontDir = path.join(fontRoot, 'fonts');
  mkdirSync(fontDir);
  for (const name of ['times.ttf', 'pagella.otf', 'stix-math.otf', 'noto-cjk.ttc']) {
    writeFileSync(path.join(fontDir, name), name);
  }
  writeFileSync(
    path.join(fontRoot, 'INSTALL-MANIFEST.txt'),
    [
      `install_complete=${installComplete ? 'yes' : 'no'}`,
      'microsoft_core_fonts_eula_accepted=yes',
      `font_files=${manifestCount}`,
      '',
    ].join('\n'),
  );
  return fontRoot;
}

function fakeFcMatch(overrides = {}) {
  const families = {
    'Times New Roman': 'Times New Roman',
    'Palatino Linotype': 'TeX Gyre Pagella',
    'Cambria Math': 'STIX Math',
    'Malgun Gothic': 'Noto Sans CJK KR',
    '맑은 고딕': 'Noto Sans CJK KR',
    '나눔명조': 'NanumMyeongjo',
    'KoPub바탕체 Medium': 'Noto Serif CJK KR',
    Wingdings: 'Webdings',
    ...overrides,
  };
  return (_command, args) => ({ status: 0, stdout: families[args.at(-1)] ?? '', stderr: '' });
}

test('academic font readiness verifies completed manifest, file count, and compatibility matches', () => {
  const fontRoot = createFontFixture();
  try {
    const status = inspectAcademicFontReadiness({ fontRoot, runCommand: fakeFcMatch() });
    assert.equal(status.ok, true);
    assert.deepEqual(
      status.results.filter((result) => result.label.startsWith('font match ')).map((result) => result.ok),
      [true, true, true, true, true, true, true, true],
    );
  } finally {
    rmSync(fontRoot, { recursive: true, force: true });
  }
});

test('academic font readiness rejects stale manifest counts and generic document-font fallbacks', () => {
  const fontRoot = createFontFixture({ manifestCount: 3 });
  try {
    const status = inspectAcademicFontReadiness({
      fontRoot,
      runCommand: fakeFcMatch({
        'Cambria Math': 'DejaVu Sans',
        'KoPub바탕체 Medium': 'Noto Sans',
        Wingdings: 'Noto Sans',
      }),
    });
    assert.equal(status.ok, false);
    assert.equal(
      status.results.find((result) => result.label === 'academic font manifest file count')?.ok,
      false,
    );
    assert.equal(status.results.find((result) => result.label === 'font match Cambria Math')?.ok, false);
    assert.equal(status.results.find((result) => result.label === 'font match KoPub바탕체 Medium')?.ok, false);
    assert.equal(status.results.find((result) => result.label === 'font match Wingdings')?.ok, false);
  } finally {
    rmSync(fontRoot, { recursive: true, force: true });
  }
});

test('academic font startup assertion rejects an incomplete installation manifest', () => {
  const fontRoot = createFontFixture({ installComplete: false });
  try {
    assert.throws(
      () => assertAcademicFontReadiness({ fontRoot, runCommand: fakeFcMatch() }),
      /Academic DOCX fonts are not ready.*install_complete=no/,
    );
  } finally {
    rmSync(fontRoot, { recursive: true, force: true });
  }
});

test('native startup and sh.start deployment both gate runtime launch on academic font readiness', () => {
  const starter = readProjectFile('editor_docx/scripts/start-editor.mjs');
  const doctor = readProjectFile('editor_docx/scripts/doctor-native-editor.mjs');
  const deploy = readProjectFile('editor_docx/scripts/deploy-native-editor.sh');

  const nativeStart = starter.slice(starter.indexOf('async function startNative'));
  assert.match(nativeStart, /assertAcademicFontReadiness\(\)/);
  assert.ok(nativeStart.indexOf('assertAcademicFontReadiness()') < nativeStart.indexOf("run('pm2', ['restart'"));
  assert.match(doctor, /inspectAcademicFontReadiness\(\)/);
  assert.ok(deploy.indexOf('doctor:native') < deploy.indexOf('start:native'));
});

test('font installer publishes a completed manifest only after every required fc-match assertion', () => {
  const installer = readProjectFile('editor_docx/scripts/install-academic-fonts.sh');

  const installCompleteIndex = installer.indexOf("printf 'install_complete=yes");
  for (const family of [
    'Times New Roman',
    'Palatino Linotype',
    'Cambria Math',
    'Malgun Gothic',
    '맑은 고딕',
    '나눔명조',
    'KoPub바탕체 Medium',
    'Wingdings',
  ]) {
    assert.match(installer, new RegExp(`assert_font "${family}"`));
    assert.ok(installer.indexOf(`assert_font "${family}"`) < installCompleteIndex);
  }
  const fontconfig = readProjectFile('editor_docx/assets/fonts/tlooto-academic-substitutions.conf');
  assert.match(fontconfig, /KoPub바탕체 Medium[\s\S]*Noto Serif CJK KR/);
  assert.match(fontconfig, /Wingdings[\s\S]*Webdings/);
  assert.ok(installCompleteIndex < installer.lastIndexOf('INSTALL-MANIFEST.txt'));
});
