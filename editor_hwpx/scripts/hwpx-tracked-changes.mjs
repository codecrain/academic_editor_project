import { createZip, readZip } from './hwpx-zip.mjs';

function trackedError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, '&quot;');
}

function decodeText(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)));
}

function findBlocks(xml, localName) {
  const tag = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${localName}\\b[^>]*>|<\\/(?:[A-Za-z_][\\w.-]*:)?${localName}\\s*>`,
    'gi',
  );
  const stack = [];
  const blocks = [];
  for (const match of xml.matchAll(tag)) {
    if (match[0].startsWith('</')) {
      const start = stack.pop();
      if (start !== undefined && stack.length === 0) {
        const end = match.index + match[0].length;
        blocks.push({ start, end, xml: xml.slice(start, end) });
      }
    } else if (!match[0].endsWith('/>')) {
      stack.push(match.index);
    }
  }
  return blocks;
}

function topLevelParagraphs(sectionXml) {
  const openEnd = sectionXml.indexOf('>') + 1;
  const closeStart = sectionXml.lastIndexOf('</');
  return findBlocks(sectionXml.slice(openEnd, closeStart), 'p').map(block => ({
    start: openEnd + block.start,
    end: openEnd + block.end,
    xml: block.xml,
  }));
}

function textRuns(paragraphXml) {
  const pattern = /<hp:t\b[^>]*>([\s\S]*?)<\/hp:t>/g;
  let textOffset = 0;
  return [...paragraphXml.matchAll(pattern)].map(match => {
    const inner = match[1];
    const plain = decodeText(inner.replace(/<[^>]*>/g, ''));
    const start = textOffset;
    textOffset += [...plain].length;
    return {
      start,
      end: textOffset,
      inner,
      innerStart: match.index + match[0].indexOf('>') + 1,
      innerEnd: match.index + match[0].lastIndexOf('</hp:t>'),
      plain,
    };
  });
}

function rawBoundary(inner, charOffset) {
  const tokens = [...inner.matchAll(/<[^>]*>|&(?:#x?[0-9a-f]+|[A-Za-z]+);|[^<&]+/gi)];
  let chars = 0;
  for (const token of tokens) {
    if (token[0].startsWith('<')) continue;
    const decoded = decodeText(token[0]);
    const values = [...decoded];
    if (charOffset <= chars + values.length) {
      if (token[0].startsWith('&')) {
        return charOffset === chars ? token.index : token.index + token[0].length;
      }
      return token.index + [...token[0]].slice(0, charOffset - chars).join('').length;
    }
    chars += values.length;
  }
  if (charOffset === chars) return inner.length;
  throw trackedError('HWPX_TRACKED_CHANGE_RANGE_INVALID', 'Tracked-change offset is outside the text run.');
}

function maxAttributeId(xml, elementPattern, attribute) {
  let max = 0;
  for (const match of xml.matchAll(elementPattern)) {
    const attr = match[0].match(new RegExp(`\\b${attribute}="(\\d+)"`, 'i'));
    if (attr) max = Math.max(max, Number(attr[1]));
  }
  return max;
}

function addHeaderChanges(headerXml, changes, author, date) {
  const existingAuthor = [...headerXml.matchAll(/<hh:trackChangeAuthor\b[^>]*\/>/g)]
    .find(match => match[0].includes(`name="${escapeAttribute(author)}"`));
  const authorId = existingAuthor
    ? Number(existingAuthor[0].match(/\bid="(\d+)"/i)?.[1] ?? 1)
    : maxAttributeId(headerXml, /<hh:trackChangeAuthor\b[^>]*\/>/g, 'id') + 1;
  let nextChangeId = maxAttributeId(headerXml, /<hh:trackChange\b[^>]*\/>/g, 'id') + 1;
  const records = changes.map(change => ({
    ...change,
    trackId: nextChangeId++,
  }));
  const changeXml = records.map(change =>
    `<hh:trackChange type="${change.type}" date="${escapeAttribute(date)}" authorID="${authorId}" hide="0" id="${change.trackId}"/>`).join('');

  let next = headerXml;
  if (/<hh:trackChanges\b/.test(next)) {
    next = next.replace(/<hh:trackChanges\b([^>]*)>([\s\S]*?)<\/hh:trackChanges>/, (all, attrs, body) => {
      const count = (body.match(/<hh:trackChange\b/g) ?? []).length + records.length;
      const nextAttrs = /\bitemCnt="/.test(attrs)
        ? attrs.replace(/\bitemCnt="[^"]*"/, `itemCnt="${count}"`)
        : `${attrs} itemCnt="${count}"`;
      return `<hh:trackChanges${nextAttrs}>${body}${changeXml}</hh:trackChanges>`;
    });
  } else {
    next = next.replace('</hh:refList>', `<hh:trackChanges itemCnt="${records.length}">${changeXml}</hh:trackChanges></hh:refList>`);
  }

  if (!existingAuthor) {
    const authorXml = `<hh:trackChangeAuthor name="${escapeAttribute(author)}" mark="1" id="${authorId}"/>`;
    if (/<hh:trackChangeAuthors\b/.test(next)) {
      next = next.replace(/<hh:trackChangeAuthors\b([^>]*)>([\s\S]*?)<\/hh:trackChangeAuthors>/, (all, attrs, body) => {
        const count = (body.match(/<hh:trackChangeAuthor\b/g) ?? []).length + 1;
        const nextAttrs = /\bitemCnt="/.test(attrs)
          ? attrs.replace(/\bitemCnt="[^"]*"/, `itemCnt="${count}"`)
          : `${attrs} itemCnt="${count}"`;
        return `<hh:trackChangeAuthors${nextAttrs}>${body}${authorXml}</hh:trackChangeAuthors>`;
      });
    } else {
      next = next.replace('</hh:refList>', `<hh:trackChangeAuthors itemCnt="1">${authorXml}</hh:trackChangeAuthors></hh:refList>`);
    }
  }
  if (!/<hh:trackchageConfig\b/.test(next)) {
    next = next.replace('</hh:head>', '<hh:trackchageConfig flags="57"/></hh:head>');
  }
  return { xml: next, records };
}

export function applyTrackedReplacement(inputBytes, command) {
  const native = command?.target?.native ?? {};
  const section = Number(native.section);
  const para = Number(native.para ?? native.paragraph);
  const offset = Number(native.offset);
  const length = Number(native.length);
  if (![section, para, offset, length].every(Number.isSafeInteger)
    || [section, para, offset, length].some(value => value < 0)) {
    throw trackedError('HWPX_TRACKED_CHANGE_TARGET_INVALID', 'Tracked replacement requires non-negative integer section, para, offset, and length.');
  }
  if (!command.author?.trim()) {
    throw trackedError('HWPX_TRACKED_CHANGE_AUTHOR_REQUIRED', 'Tracked replacement requires a non-empty author.');
  }
  const replacement = String(command.text ?? '');
  if (length === 0 && replacement.length === 0) {
    throw trackedError('HWPX_TRACKED_CHANGE_EMPTY', 'Tracked replacement must insert or delete text.');
  }

  const entries = readZip(inputBytes);
  const sectionName = `Contents/section${section}.xml`;
  const sectionXml = entries.get(sectionName)?.toString('utf8');
  const headerXml = entries.get('Contents/header.xml')?.toString('utf8');
  if (!sectionXml || !headerXml) {
    throw trackedError('HWPX_TRACKED_CHANGE_PACKAGE_INVALID', 'HWPX header or target section is missing.');
  }
  const paragraph = topLevelParagraphs(sectionXml)[para];
  if (!paragraph) {
    throw trackedError('HWPX_TRACKED_CHANGE_TARGET_INVALID', 'Target paragraph does not exist.', { section, para });
  }
  const run = textRuns(paragraph.xml).find(item =>
    offset >= item.start && offset + length <= item.end);
  if (!run) {
    throw trackedError(
      'HWPX_TRACKED_CHANGE_RANGE_UNSUPPORTED',
      'Tracked replacement currently requires the complete range to stay inside one hp:t run.',
      { section, para, offset, length },
    );
  }
  const localStart = offset - run.start;
  const localEnd = localStart + length;
  const rawStart = rawBoundary(run.inner, localStart);
  const rawEnd = rawBoundary(run.inner, localEnd);
  const deletedRaw = run.inner.slice(rawStart, rawEnd);
  const changeSpecs = [];
  if (replacement) changeSpecs.push({ type: 'Insert' });
  if (length > 0) changeSpecs.push({ type: 'Delete' });
  const date = command.date ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const header = addHeaderChanges(headerXml, changeSpecs, command.author.trim(), date);
  const insertRecord = header.records.find(item => item.type === 'Insert');
  const deleteRecord = header.records.find(item => item.type === 'Delete');
  let markerId = Math.max(
    1,
    maxAttributeId(sectionXml, /<hp:(?:insert|delete)(?:Begin|End)\b[^>]*\/>/g, 'Id'),
  ) + 1;
  const deleteXml = deleteRecord
    ? `<hp:deleteBegin Id="${markerId}" TcId="${deleteRecord.trackId}"/>${deletedRaw}<hp:deleteEnd Id="${markerId++}" TcId="${deleteRecord.trackId}" paraend="0"/>`
    : '';
  const insertXml = insertRecord
    ? `<hp:insertBegin Id="${markerId}" TcId="${insertRecord.trackId}"/>${escapeText(replacement)}<hp:insertEnd Id="${markerId}" TcId="${insertRecord.trackId}" paraend="0"/>`
    : '';
  const nextInner = `${run.inner.slice(0, rawStart)}${deleteXml}${insertXml}${run.inner.slice(rawEnd)}`;
  const nextParagraph = `${paragraph.xml.slice(0, run.innerStart)}${nextInner}${paragraph.xml.slice(run.innerEnd)}`;
  const nextSection = `${sectionXml.slice(0, paragraph.start)}${nextParagraph}${sectionXml.slice(paragraph.end)}`;
  entries.set('Contents/header.xml', Buffer.from(header.xml, 'utf8'));
  entries.set(sectionName, Buffer.from(nextSection, 'utf8'));

  return {
    bytes: createZip(entries),
    section,
    para,
    offset,
    length,
    text: replacement,
    author: command.author.trim(),
    date,
    changeTypes: [
      ...(deleteRecord ? ['Delete'] : []),
      ...(insertRecord ? ['Insert'] : []),
    ],
  };
}
