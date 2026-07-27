import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { readZip } from '../../editor_docx/scripts/docx-api-utils.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function xmlText(entries, name) {
  return entries.get(name)?.toString('utf8') ?? '';
}

function count(xml, pattern) {
  return [...xml.matchAll(pattern)].length;
}

function sortedUniqueMatches(xml, pattern, group = 1) {
  return [...new Set([...xml.matchAll(pattern)].map((match) => match[group]).filter(Boolean))].sort();
}

function decodeXmlText(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function semanticText(xml) {
  const raw = [...xml.matchAll(/<w:(?:t|delText)\b[^>]*>([\s\S]*?)<\/w:(?:t|delText)>/g)]
    .map((match) => decodeXmlText(match[1]))
    .join('');
  return {
    raw,
    normalized: raw.replace(/\s+/g, ' ').trim(),
  };
}

function partHashes(entries, pattern) {
  return [...entries.entries()]
    .filter(([name]) => !name.endsWith('/') && pattern.test(name))
    .map(([name, bytes]) => ({ name, sha256: sha256(bytes), bytes: bytes.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function comparablePartHashes(parts) {
  return parts.map(({ name, sha256: hash, bytes }) => ({ name, sha256: hash, bytes }));
}

function canonicalSectionGeometry(xml) {
  return [...xml.matchAll(/<w:sectPr\b[^>]*>([\s\S]*?)<\/w:sectPr>/g)].map((sectionMatch) => {
    const sectionXml = sectionMatch[1];
    const readAttributes = (tagName, names) => {
      const tag = sectionXml.match(new RegExp(`<w:${tagName}\\b([^>]*)\\/?\\s*>`))?.[1] ?? '';
      return Object.fromEntries(
        names.map((name) => [
          name,
          tag.match(new RegExp(`\\bw:${name}="([^"]*)"`))?.[1] ?? null,
        ]),
      );
    };
    return {
      pageSize: readAttributes('pgSz', ['w', 'h', 'orient', 'code']),
      pageMargin: readAttributes('pgMar', [
        'top',
        'right',
        'bottom',
        'left',
        'header',
        'footer',
        'gutter',
      ]),
      columns: readAttributes('cols', ['num', 'space', 'equalWidth']),
      pageNumbering: readAttributes('pgNumType', ['fmt', 'start']),
    };
  });
}

function inspect(bytes) {
  const entries = readZip(bytes);
  const documentXml = xmlText(entries, 'word/document.xml');
  const stylesXml = xmlText(entries, 'word/styles.xml');
  const numberingXml = xmlText(entries, 'word/numbering.xml');
  const settingsXml = xmlText(entries, 'word/settings.xml');
  const names = [...entries.keys()].filter((name) => !name.endsWith('/')).sort();

  const text = semanticText(documentXml);
  return {
    package: {
      bytes: bytes.length,
      sha256: sha256(bytes),
      partCount: names.length,
      parts: names,
    },
    semanticText: {
      sha256: sha256(text.normalized.replace(/\s+/g, '')),
      normalizedSha256: sha256(text.normalized),
      characters: text.normalized.length,
      rawCharacters: text.raw.length,
    },
    structure: {
      paragraphs: count(documentXml, /<w:p(?:\s|>)/g),
      tables: count(documentXml, /<w:tbl(?:\s|>)/g),
      rows: count(documentXml, /<w:tr(?:\s|>)/g),
      cells: count(documentXml, /<w:tc(?:\s|>)/g),
      sections: count(documentXml, /<w:sectPr(?:\s|>)/g),
      drawings: count(documentXml, /<w:drawing(?:\s|>)/g),
      hyperlinks: count(documentXml, /<w:hyperlink(?:\s|>)/g),
      bookmarks: count(documentXml, /<w:bookmarkStart(?:\s|>)/g),
      insertions: count(documentXml, /<w:ins(?:\s|>)/g),
      deletions: count(documentXml, /<w:del(?:\s|>)/g),
      comments: count(documentXml, /<w:commentRangeStart(?:\s|>)/g),
      fields: count(documentXml, /<w:fldChar(?:\s|>)/g),
      pageBreaks: count(documentXml, /<w:br\b[^>]*w:type="page"/g),
    },
    sectionGeometry: canonicalSectionGeometry(documentXml),
    styles: {
      count: count(stylesXml, /<w:style(?:\s|>)/g),
      ids: sortedUniqueMatches(stylesXml, /<w:style\b[^>]*w:styleId="([^"]+)"/g),
    },
    numbering: {
      abstracts: count(numberingXml, /<w:abstractNum(?:\s|>)/g),
      instances: count(numberingXml, /<w:num(?:\s|>)/g),
    },
    languages: sortedUniqueMatches(
      [documentXml, stylesXml].join('\n'),
      /<w:lang\b[^>]*w:(?:val|eastAsia|bidi)="([^"]+)"/g,
    ),
    settings: {
      trackRevisions: /<w:trackRevisions(?:\s|\/|>)/.test(settingsXml),
      updateFields: /<w:updateFields\b[^>]*w:val="(?:true|1)"/.test(settingsXml),
    },
    media: partHashes(entries, /^word\/media\//),
    headers: partHashes(entries, /^word\/header\d+\.xml$/),
    footers: partHashes(entries, /^word\/footer\d+\.xml$/),
    charts: partHashes(entries, /^word\/charts\//),
    embeddings: partHashes(entries, /^word\/embeddings\//),
  };
}

function compare(before, after) {
  const beforeParts = new Set(before.package.parts);
  const afterParts = new Set(after.package.parts);
  const lostParts = [...beforeParts].filter((part) => !afterParts.has(part));
  const addedParts = [...afterParts].filter((part) => !beforeParts.has(part));
  const criticalPrefixes = [
    'word/document.xml',
    'word/styles.xml',
    'word/numbering.xml',
    'word/settings.xml',
    'word/header',
    'word/footer',
    'word/media/',
    'word/charts/',
    'word/embeddings/',
    'word/comments',
    'word/footnotes',
    'word/endnotes',
  ];
  const criticalLostParts = lostParts.filter((part) => criticalPrefixes.some((prefix) => part.startsWith(prefix)));
  const metricDelta = Object.fromEntries(
    Object.keys(before.structure).map((key) => [key, after.structure[key] - before.structure[key]]),
  );
  const styleIdsLost = before.styles.ids.filter((styleId) => !after.styles.ids.includes(styleId));
  const styleCatalogChanged =
    before.styles.count !== after.styles.count ||
    JSON.stringify(before.styles.ids) !== JSON.stringify(after.styles.ids);
  const whitespaceChanged = before.semanticText.normalizedSha256 !== after.semanticText.normalizedSha256;
  const languageSetChanged = JSON.stringify(before.languages) !== JSON.stringify(after.languages);
  const settingsChanged = JSON.stringify(before.settings) !== JSON.stringify(after.settings);
  const sectionGeometryChanged =
    JSON.stringify(before.sectionGeometry) !== JSON.stringify(after.sectionGeometry);
  const mediaHashesChanged = JSON.stringify(before.media) !== JSON.stringify(after.media);
  const headerHashesChanged =
    JSON.stringify(comparablePartHashes(before.headers)) !==
    JSON.stringify(comparablePartHashes(after.headers));
  const footerHashesChanged =
    JSON.stringify(comparablePartHashes(before.footers)) !==
    JSON.stringify(comparablePartHashes(after.footers));
  const chartHashesChanged =
    JSON.stringify(comparablePartHashes(before.charts)) !==
    JSON.stringify(comparablePartHashes(after.charts));
  const embeddingHashesChanged =
    JSON.stringify(comparablePartHashes(before.embeddings)) !==
    JSON.stringify(comparablePartHashes(after.embeddings));

  const compatibilityFailures = [
    ...(before.semanticText.sha256 === after.semanticText.sha256 ? [] : ['semantic_text_changed']),
    ...(Object.values(metricDelta).every((value) => value === 0) ? [] : ['document_structure_changed']),
    ...(criticalLostParts.length ? ['critical_package_parts_lost'] : []),
    ...(mediaHashesChanged ? ['media_changed'] : []),
    ...(headerHashesChanged ? ['headers_changed'] : []),
    ...(footerHashesChanged ? ['footers_changed'] : []),
    ...(chartHashesChanged ? ['charts_changed'] : []),
    ...(embeddingHashesChanged ? ['embeddings_changed'] : []),
    ...(sectionGeometryChanged ? ['section_geometry_changed'] : []),
  ];
  const strictFailures = [
    ...compatibilityFailures,
    ...(whitespaceChanged ? ['text_whitespace_changed'] : []),
    ...(styleCatalogChanged ? ['style_catalog_changed'] : []),
    ...(languageSetChanged ? ['language_set_changed'] : []),
    ...(settingsChanged ? ['document_settings_changed'] : []),
  ];

  return {
    ok: strictFailures.length === 0,
    strictNoOpOk: strictFailures.length === 0,
    compatible: compatibilityFailures.length === 0,
    failures: strictFailures,
    compatibilityFailures,
    packageDelta: {
      bytes: after.package.bytes - before.package.bytes,
      parts: after.package.partCount - before.package.partCount,
      lostParts,
      addedParts,
      criticalLostParts,
    },
    metricDelta,
    styleIdsLost,
    warnings: [
      ...(styleIdsLost.length ? ['style_identifiers_normalized'] : []),
      ...(whitespaceChanged ? ['text_whitespace_normalized'] : []),
    ],
    styleCatalogChanged,
    languageSetChanged,
    settingsChanged,
    sectionGeometryChanged,
    mediaHashesChanged,
    headerHashesChanged,
    footerHashesChanged,
    chartHashesChanged,
    embeddingHashesChanged,
  };
}

const [beforePath, afterPath, outputPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  throw new Error('Usage: node docx-roundtrip-audit.mjs <before.docx> <after.docx> [report.json]');
}

const before = inspect(await readFile(path.resolve(beforePath)));
const after = inspect(await readFile(path.resolve(afterPath)));
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  before,
  after,
  comparison: compare(before, after),
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  await writeFile(path.resolve(outputPath), serialized, 'utf8');
}
process.stdout.write(serialized);
if (!report.comparison.ok) {
  process.exitCode = 1;
}
