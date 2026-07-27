import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const files = process.argv.slice(2);
if (!files.length) {
  throw new Error('Pass one or more XLSX files.');
}

const qaRoot = path.resolve('evaluation/hwpx-public-sector-v1/.qa/xlsx-render');
await fs.mkdir(qaRoot, { recursive: true });

for (const file of files) {
  const absolute = path.resolve(file);
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(absolute));
  const summary = await workbook.inspect({
    kind: 'workbook,sheet,table',
    maxChars: 6000,
    tableMaxRows: 6,
    tableMaxCols: 8,
    tableMaxCellChars: 80,
  });
  const errors = await workbook.inspect({
    kind: 'match',
    searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
    options: { useRegex: true, maxResults: 300 },
    summary: 'supporting workbook formula error scan',
  });
  const sheets = workbook.worksheets.items;
  const rendered = [];
  for (const sheet of sheets) {
    const preview = await workbook.render({
      sheetName: sheet.name,
      autoCrop: 'all',
      scale: 1,
      format: 'png',
    });
    const output = path.join(
      qaRoot,
      `${path.basename(file, path.extname(file))}-${sheet.name.replace(/[^\p{L}\p{N}_.-]+/gu, '_')}.png`,
    );
    const bytes = new Uint8Array(await preview.arrayBuffer());
    await fs.writeFile(output, bytes);
    rendered.push({ sheet: sheet.name, output, byteLength: bytes.length });
  }
  console.log(JSON.stringify({
    file: absolute,
    sheets: sheets.map((sheet) => sheet.name),
    summary: summary.ndjson,
    errors: errors.ndjson,
    rendered,
  }));
}
