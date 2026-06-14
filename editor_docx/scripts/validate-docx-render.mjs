import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const defaultNames = [
  '01-template-original',
  '02-template-api-improved',
  '03-report-original',
  '04-report-api-improved',
];

function repoPath(...parts) {
  return path.resolve(process.cwd(), ...parts);
}

function defaultPythonPath() {
  if (process.env.DOCX_VALIDATE_PYTHON) {
    return process.env.DOCX_VALIDATE_PYTHON;
  }
  const userProfile = process.env.USERPROFILE;
  if (userProfile) {
    const bundled = path.join(userProfile, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');
    if (existsSync(bundled)) {
      return bundled;
    }
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(' ')} failed with exit ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

function exportWithWord(documents) {
  if (process.platform !== 'win32') {
    return { skipped: true, reason: 'Word COM validation is Windows-only.' };
  }

  const ps = `
$ErrorActionPreference = 'Stop'
$docs = ConvertFrom-Json @'
${JSON.stringify(documents)}
'@
$word = $null
$results = @()
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  foreach ($item in $docs) {
    New-Item -ItemType Directory -Force -Path $item.outputDir | Out-Null
    $doc = $word.Documents.Open($item.docxPath, $false, $true)
    try {
      $doc.ExportAsFixedFormat($item.pdfPath, 17)
      $results += [PSCustomObject]@{ docxPath = $item.docxPath; pdfPath = $item.pdfPath; ok = $true }
    } finally {
      $doc.Close($false)
      [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
    }
  }
} finally {
  if ($word -ne $null) {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }
}
$results | ConvertTo-Json -Depth 4
`;

  const output = run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { timeout: 120000 });
  return { skipped: false, results: JSON.parse(output) };
}

function renderPdfs(documents) {
  const python = defaultPythonPath();
  const script = `
from pathlib import Path
import json
import fitz
docs = json.loads(r'''${JSON.stringify(documents)}''')
results = []
for item in docs:
    folder = Path(item["outputDir"])
    pdf_path = Path(item["pdfPath"])
    if not pdf_path.exists() or pdf_path.stat().st_size <= 0:
        raise RuntimeError(f"missing PDF: {pdf_path}")
    for old in folder.glob("page-*.png"):
        old.unlink()
    doc = fitz.open(pdf_path)
    for i, page in enumerate(doc, start=1):
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        out = folder / f"page-{i}.png"
        pix.save(out)
    results.append({"pdfPath": str(pdf_path), "pageCount": len(doc)})
print(json.dumps(results, ensure_ascii=False))
`;
  const output = run(python, ['-c', script], { timeout: 120000 });
  return JSON.parse(output);
}

function collectDocuments(names) {
  return names.map((name) => {
    const docxPath = repoPath('output', 'docx-review', `${name}.docx`);
    const outputDir = repoPath('output', 'docx-review', 'rendered', name);
    const pdfPath = path.join(outputDir, `${name}.pdf`);
    assert.ok(existsSync(docxPath), `DOCX not found: ${docxPath}`);
    mkdirSync(outputDir, { recursive: true });
    return { name, docxPath, outputDir, pdfPath };
  });
}

function validateRenderedOutputs(documents, rendered) {
  const byPdf = new Map(rendered.map((item) => [path.resolve(item.pdfPath), item]));
  return documents.map((item) => {
    assert.ok(existsSync(item.pdfPath), `PDF was not created: ${item.pdfPath}`);
    assert.ok(statSync(item.pdfPath).size > 0, `PDF is empty: ${item.pdfPath}`);
    const renderInfo = byPdf.get(path.resolve(item.pdfPath));
    assert.ok(renderInfo, `render info missing for ${item.pdfPath}`);
    const pngs = readdirSync(item.outputDir).filter((name) => /^page-\d+\.png$/i.test(name)).sort();
    assert.equal(pngs.length, renderInfo.pageCount, `${item.name} PNG page count mismatch`);
    for (const png of pngs) {
      const pngPath = path.join(item.outputDir, png);
      assert.ok(statSync(pngPath).size > 0, `PNG is empty: ${pngPath}`);
    }
    return {
      name: item.name,
      docxPath: item.docxPath,
      pdfPath: item.pdfPath,
      pageCount: renderInfo.pageCount,
      pngCount: pngs.length,
    };
  });
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : defaultNames;
const documents = collectDocuments(names);
const word = exportWithWord(documents);
if (word.skipped) {
  console.log(JSON.stringify({ ok: false, skipped: true, reason: word.reason }, null, 2));
  process.exitCode = 1;
} else {
  const rendered = renderPdfs(documents);
  const results = validateRenderedOutputs(documents, rendered);
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}
