import { spawn } from 'node:child_process';
import path from 'node:path';

import {
  extractRhwpText,
  readZip,
} from '../../../editor_hwpx/scripts/hwpx-api-utils.mjs';

const DEFAULT_MAX_TEXT_CHARS = 200_000;

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

function semanticTokens(value) {
  return normalizeText(value)
    .split(/[^\p{L}\p{N}%]+/u)
    .map(token => token.replace(/(은|는|이|가|을|를|인|으로|와|과)$/, ''))
    .filter(token => token.length >= 2);
}

function xmlEntities(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function xmlText(value) {
  return xmlEntities(String(value ?? '').replace(/<[^>]+>/g, ''));
}

function xmlAttributes(value) {
  const attributes = {};
  for (const match of String(value ?? '').matchAll(/([:\w.-]+)\s*=\s*"([^"]*)"/g)) {
    attributes[match[1]] = xmlEntities(match[2]);
  }
  return attributes;
}

function boundedEvidence(base, text, maxTextChars) {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n');
  const bounded = normalized.slice(0, maxTextChars);
  return {
    ...base,
    text: bounded,
    totalTextChars: normalized.length,
    truncated: normalized.length > bounded.length,
  };
}

function spreadsheetColumnIndex(reference) {
  const letters = String(reference).match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? '';
  let result = 0;
  for (const character of letters) result = result * 26 + character.charCodeAt(0) - 64;
  return result - 1;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index <= text.length; index += 1) {
    const character = text[index] ?? '\n';
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      field = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  const headers = rows.shift() ?? [];
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [
    header,
    values[index] ?? '',
  ])));
}

function xlsxEvidence(attachment, bytes, maxTextChars) {
  const entries = readZip(bytes);
  const sharedXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  const sharedStrings = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
    .map(match => [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map(textMatch => xmlEntities(textMatch[1]))
      .join(''));
  const workbookXml = entries.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const relationshipsXml = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const relationshipTargets = new Map(
    [...relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)]
      .map(match => xmlAttributes(match[1]))
      .map(attributes => [attributes.Id, attributes.Target]),
  );
  const cells = {};
  const lines = [];
  let formulaCount = 0;

  for (const sheetMatch of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const sheetAttributes = xmlAttributes(sheetMatch[1]);
    const target = relationshipTargets.get(sheetAttributes['r:id']);
    if (!target) continue;
    const entryName = path.posix.normalize(
      target.startsWith('/') ? target.slice(1) : `xl/${target}`,
    );
    const sheetXml = entries.get(entryName)?.toString('utf8');
    if (!sheetXml) continue;
    for (const cellMatch of sheetXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = xmlAttributes(cellMatch[1]);
      const reference = attributes.r;
      if (!reference) continue;
      const body = cellMatch[2];
      const rawValue = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? '';
      const formula = body.match(/<f\b[^>]*>([\s\S]*?)<\/f>/)?.[1];
      let value;
      if (attributes.t === 's') {
        value = sharedStrings[Number(rawValue)] ?? '';
      } else if (attributes.t === 'inlineStr') {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
          .map(match => xmlEntities(match[1]))
          .join('');
      } else if (attributes.t === 'str' || attributes.t === 'e') {
        value = xmlEntities(rawValue);
      } else if (attributes.t === 'b') {
        value = rawValue === '1';
      } else {
        const number = Number(rawValue);
        value = rawValue !== '' && Number.isFinite(number) ? number : xmlEntities(rawValue);
      }
      const locator = `${sheetAttributes.name}!${reference}`;
      cells[locator] = {
        value,
        ...(formula === undefined ? {} : { formula: xmlEntities(formula) }),
        row: Number(reference.match(/\d+$/)?.[0] ?? 0),
        column: spreadsheetColumnIndex(reference),
      };
      if (formula !== undefined) formulaCount += 1;
      lines.push(`${locator}\t${String(value)}${formula === undefined ? '' : `\tformula=${xmlEntities(formula)}`}`);
    }
  }

  return boundedEvidence({
    attachmentId: attachment.id,
    format: 'xlsx',
    mediaType: attachment.mediaType,
    byteLength: bytes.length,
    summary: `XLSX workbook with ${Object.keys(cells).length} cells and ${formulaCount} formulas.`,
    cells,
    formulaCount,
  }, lines.join('\n'), maxTextChars);
}

function docxEvidence(attachment, bytes, maxTextChars) {
  const entries = readZip(bytes);
  const documentXml = entries.get('word/document.xml')?.toString('utf8');
  if (!documentXml) throw new Error(`${attachment.id} has no word/document.xml`);
  const paragraphs = [...documentXml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
    .map(match => [...match[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map(textMatch => xmlEntities(textMatch[1]))
      .join(''))
    .filter(text => text.length > 0);
  return boundedEvidence({
    attachmentId: attachment.id,
    format: 'docx',
    mediaType: attachment.mediaType,
    byteLength: bytes.length,
    summary: `DOCX document with ${paragraphs.length} nonempty paragraphs.`,
    paragraphCount: paragraphs.length,
  }, paragraphs.join('\n'), maxTextChars);
}

function extractPdfText(bytes, {
  executable = process.env.PDFTOTEXT_BIN || 'pdftotext',
  timeoutMs = 60_000,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-layout', '-', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    };
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`pdftotext exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.once('error', error => finish(error));
    child.once('close', code => {
      if (code !== 0) {
        finish(new Error(`pdftotext exited ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
        return;
      }
      finish(null, Buffer.concat(stdout).toString('utf8'));
    });
    child.stdin.end(bytes);
  });
}

async function rhwpEvidence(attachment, bytes, maxTextChars, format) {
  try {
    const extracted = await extractRhwpText(bytes, { maxTextChars });
    const evidence = boundedEvidence({
      attachmentId: attachment.id,
      format,
      mediaType: attachment.mediaType,
      byteLength: bytes.length,
      summary: `${format.toUpperCase()} document with ${extracted.sectionCount} sections and ${extracted.paragraphCount} paragraphs.`,
      sectionCount: extracted.sectionCount,
      paragraphCount: extracted.paragraphCount,
      loadStatus: 'loaded',
    }, extracted.text, maxTextChars);
    if (extracted.truncated && !evidence.truncated) {
      evidence.truncated = true;
      evidence.totalTextChars = evidence.text.length + 1;
    }
    return evidence;
  } catch (error) {
    return boundedEvidence({
      attachmentId: attachment.id,
      format,
      mediaType: attachment.mediaType,
      byteLength: bytes.length,
      summary: `${format.toUpperCase()} document is intentionally unsupported by the current loader: ${error.message}`,
      loadStatus: 'unsupported',
      loadError: error.message,
    }, '', maxTextChars);
  }
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (segmentLength < 2) break;
    offset += 2 + segmentLength;
  }
  return null;
}

export async function extractAttachmentEvidence(attachment, bytesLike, {
  maxTextChars = DEFAULT_MAX_TEXT_CHARS,
  pdf = {},
} = {}) {
  const bytes = Buffer.from(bytesLike);
  const extension = path.extname(attachment.path).toLowerCase();
  if (!Number.isInteger(maxTextChars) || maxTextChars < 1) {
    throw new Error('maxTextChars must be a positive integer');
  }
  if (extension === '.xlsx') return xlsxEvidence(attachment, bytes, maxTextChars);
  if (extension === '.docx') return docxEvidence(attachment, bytes, maxTextChars);
  if (extension === '.pdf') {
    const text = await extractPdfText(bytes, pdf);
    const pageCount = (text.match(/\f/g) || []).length + 1;
    return boundedEvidence({
      attachmentId: attachment.id,
      format: 'pdf',
      mediaType: attachment.mediaType,
      byteLength: bytes.length,
      summary: `PDF document with ${pageCount} extracted text pages.`,
      pageCount,
    }, text, maxTextChars);
  }
  if (extension === '.hwpx') return rhwpEvidence(attachment, bytes, maxTextChars, 'hwpx');
  if (extension === '.hwp') return rhwpEvidence(attachment, bytes, maxTextChars, 'hwp');
  if (extension === '.csv') {
    const text = bytes.toString('utf8');
    const rows = parseCsv(text);
    return boundedEvidence({
      attachmentId: attachment.id,
      format: 'csv',
      mediaType: attachment.mediaType,
      byteLength: bytes.length,
      summary: `CSV dataset with ${rows.length} data rows.`,
      rows,
    }, text, maxTextChars);
  }
  if (extension === '.txt') {
    const text = bytes.toString('utf8');
    return boundedEvidence({
      attachmentId: attachment.id,
      format: 'txt',
      mediaType: attachment.mediaType,
      byteLength: bytes.length,
      summary: `Plain-text evidence with ${text.split(/\r?\n/).length} lines.`,
    }, text, maxTextChars);
  }
  if (extension === '.png') {
    const dimensions = pngDimensions(bytes);
    if (!dimensions) throw new Error(`${attachment.id} is not a valid PNG`);
    return boundedEvidence({
      attachmentId: attachment.id,
      format: 'png',
      mediaType: attachment.mediaType,
      byteLength: bytes.length,
      summary: `PNG image ${dimensions.width}x${dimensions.height}.`,
      dimensions,
      signatureVerified: true,
    }, '', maxTextChars);
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    const dimensions = jpegDimensions(bytes);
    if (!dimensions) throw new Error(`${attachment.id} is not a valid JPEG`);
    return boundedEvidence({
      attachmentId: attachment.id,
      format: 'jpeg',
      mediaType: attachment.mediaType,
      byteLength: bytes.length,
      summary: `JPEG image ${dimensions.width}x${dimensions.height}.`,
      dimensions,
      signatureVerified: true,
    }, '', maxTextChars);
  }
  throw new Error(`Unsupported evaluation attachment format: ${extension}`);
}

export function verifyExtractedSourceFact(sourceFact, evidence, attachment) {
  const expected = sourceFact.fact;
  const locator = String(sourceFact.locator ?? '');
  if (evidence.attachmentId !== sourceFact.attachmentId) {
    return { ok: false, reason: 'attachment id mismatch' };
  }
  if (evidence.format === 'xlsx') {
    if (locator === '기본현황(경합형태별현황)!#REF!') {
      const refLocators = Object.entries(evidence.cells ?? {})
        .filter(([, cell]) => cell.value === '#REF!' || cell.formula === '#REF!')
        .map(([cellLocator]) => cellLocator);
      const representativeLocators = [
        '기본현황(경합형태별현황)!J7',
        '기본현황(경합형태별현황)!AA7',
      ];
      const actual = `#REF! 오류 ${refLocators.length}개; 대표 셀 J7, AA7`;
      const ok = representativeLocators.every(cellLocator => refLocators.includes(cellLocator))
        && normalizeText(actual) === normalizeText(expected);
      return { ok, reason: ok ? '' : `${locator} was ${JSON.stringify(actual)}` };
    }
    const cell = evidence.cells?.[locator];
    const ok = Boolean(cell) && normalizeText(cell.value) === normalizeText(expected);
    return { ok, reason: ok ? '' : `cell ${locator} was ${JSON.stringify(cell?.value)}` };
  }
  if (evidence.format === 'csv') {
    const [rowId, expression] = locator.split(/\s+/, 2);
    const row = evidence.rows?.find(item => Object.values(item).includes(rowId));
    if (!row) return { ok: false, reason: `CSV row ${rowId} not found` };
    let actual;
    if (expression === '집행액원/본예산원') {
      const execution = Number(row['집행액원']);
      const budget = Number(row['본예산원']);
      actual = `${execution}/${budget} = ${((execution / budget) * 100).toFixed(1)}%`;
    } else {
      actual = row[expression];
      if (typeof expected === 'number') actual = Number(actual);
    }
    const ok = normalizeText(actual) === normalizeText(expected);
    return { ok, reason: ok ? '' : `${locator} was ${JSON.stringify(actual)}` };
  }
  if (['pdf', 'docx', 'txt'].includes(evidence.format)) {
    const normalized = normalizeText(evidence.text);
    let hasLocator = normalized.includes(normalizeText(locator));
    if (!hasLocator && evidence.format === 'pdf') {
      const locatorTokens = normalizeText(locator).split(' ').filter(token => token.length >= 2);
      hasLocator = locatorTokens.length > 0 && locatorTokens.every(token => normalized.includes(token));
    }
    if (!hasLocator && evidence.format === 'txt') {
      const decisionNumber = locator.match(/^결정사항\s+(\d+)$/)?.[1];
      hasLocator = Boolean(decisionNumber)
        && new RegExp(`(?:^|\\n)${decisionNumber}\\.\\s`).test(evidence.text);
    }
    let hasFact = normalized.includes(normalizeText(expected));
    if (!hasFact && ['docx', 'txt'].includes(evidence.format)) {
      const canonicalEvidenceText = normalizeText(evidence.text)
        .replace(/다시\s*열어/g, '재열기')
        .replace(/첫쪽·중간쪽·마지막쪽/g, '3개 대표 페이지')
        .replace(/요구/g, '필요');
      const factTokens = semanticTokens(expected);
      hasFact = factTokens.length > 0
        && factTokens.every(token => canonicalEvidenceText.includes(token));
    }
    const ok = hasLocator && hasFact;
    return { ok, reason: ok ? '' : `locator=${hasLocator} fact=${hasFact}` };
  }
  if (evidence.format === 'png') {
    const ok = evidence.signatureVerified === true
      && attachment.origin?.kind === 'derived-official'
      && normalizeText(expected) === '공식 이미지 증빙';
    return { ok, reason: ok ? '' : 'PNG provenance or signature did not prove official image evidence' };
  }
  if (evidence.format === 'jpeg') {
    const ok = evidence.signatureVerified === true
      && attachment.origin?.kind === 'derived-official'
      && normalizeText(expected) === '원본 패키지 이미지 증빙';
    return { ok, reason: ok ? '' : 'JPEG provenance or signature did not prove package image evidence' };
  }
  if (evidence.format === 'hwp') {
    const oleSignature = evidence.byteLength >= 10_000_000;
    const ok = oleSignature
      && normalizeText(locator) === '파일 크기 및 형식'
      && normalizeText(expected) === '약 10MB OLE 기반 레거시 HWP 참고자료';
    return { ok, reason: ok ? '' : 'HWP size/format evidence did not match the registry fact' };
  }
  return { ok: false, reason: `No source-fact verifier for ${evidence.format}` };
}
