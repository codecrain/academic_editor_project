#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZip } from './hwpx-zip.mjs';

const ROLES = ['baseline', 'tracked', 'reopened', 'accepted', 'rejected'];
const HEADER_ENTRY = 'Contents/header.xml';
const SECTION_ENTRY_PATTERN = /^Contents\/section\d+\.xml$/i;
const NATIVE_MARKERS = ['insertBegin', 'insertEnd', 'deleteBegin', 'deleteEnd'];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseAttributes(source = '') {
  const attributes = {};
  const pattern = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
  }
  return attributes;
}

function decodeXmlText(source = '') {
  return source
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, value) =>
      String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#([0-9]+);/g, (_, value) =>
      String.fromCodePoint(Number.parseInt(value, 10)));
}

function extractElements(xml, localName) {
  const pattern = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${localName}\\b([^>]*)\\/?\\s*>`,
    'gi',
  );
  return [...xml.matchAll(pattern)].map(match => ({
    raw: match[0],
    attributes: parseAttributes(match[1]),
    index: match.index,
  }));
}

function extractHeaderRevisions(headerXml) {
  const authors = new Map(
    extractElements(headerXml, 'trackChangeAuthor').map(item => [
      item.attributes.id,
      item.attributes.name ?? '',
    ]),
  );

  return extractElements(headerXml, 'trackChange').map(item => ({
    id: item.attributes.id ?? '',
    type: item.attributes.type ?? '',
    date: item.attributes.date ?? '',
    authorId: item.attributes.authorid ?? '',
    author: authors.get(item.attributes.authorid) ?? '',
    hide: item.attributes.hide ?? '',
  }));
}

function extractSectionMarkers(sectionXml, entryName) {
  const markers = [];
  for (const localName of NATIVE_MARKERS) {
    for (const item of extractElements(sectionXml, localName)) {
      markers.push({
        entry: entryName,
        localName,
        index: item.index,
        id: item.attributes.id ?? '',
        trackId: item.attributes.tcid ?? '',
      });
    }
  }
  return markers.sort((left, right) => left.index - right.index);
}

function extractRevisionText(sectionXml, beginMarker) {
  const endName = beginMarker.localName === 'insertBegin' ? 'insertEnd' : 'deleteEnd';
  const endPattern = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${endName}\\b([^>]*)\\/?\\s*>`,
    'gi',
  );
  endPattern.lastIndex = beginMarker.index;
  for (const match of sectionXml.matchAll(endPattern)) {
    const attributes = parseAttributes(match[1]);
    if (attributes.id === beginMarker.id && attributes.tcid === beginMarker.trackId) {
      const beginEnd = sectionXml.indexOf('>', beginMarker.index) + 1;
      return decodeXmlText(sectionXml.slice(beginEnd, match.index));
    }
  }
  return '';
}

function inspectPackage(bytes, role) {
  const entries = readZip(bytes);
  const entryHashes = Object.fromEntries(
    [...entries.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, contents]) => [name, sha256(contents)]),
  );
  const headerXml = Buffer.from(entries.get(HEADER_ENTRY) ?? []).toString('utf8');
  const revisions = extractHeaderRevisions(headerXml);
  const declaredIds = new Set(revisions.map(item => item.id));
  const sections = [...entries.entries()]
    .filter(([name]) => SECTION_ENTRY_PATTERN.test(name))
    .map(([name, contents]) => ({
      name,
      xml: Buffer.from(contents).toString('utf8'),
    }));
  const markers = sections.flatMap(section =>
    extractSectionMarkers(section.xml, section.name));
  const linkedMarkers = markers.filter(marker => declaredIds.has(marker.trackId));
  const beginMarkers = linkedMarkers.filter(marker =>
    marker.localName === 'insertBegin' || marker.localName === 'deleteBegin');
  const changes = beginMarkers.map(marker => {
    const section = sections.find(item => item.name === marker.entry);
    const revision = revisions.find(item => item.id === marker.trackId) ?? {};
    return {
      type: marker.localName === 'insertBegin' ? 'Insert' : 'Delete',
      author: revision.author ?? '',
      date: revision.date ?? '',
      text: extractRevisionText(section?.xml ?? '', marker),
    };
  });
  const documentText = sections.map(section => decodeXmlText(section.xml)).join('');
  const hasPairedMarkers = beginMarkers.every(begin => {
    const endName = begin.localName === 'insertBegin' ? 'insertEnd' : 'deleteEnd';
    return linkedMarkers.some(end =>
      end.localName === endName
      && end.entry === begin.entry
      && end.id === begin.id
      && end.trackId === begin.trackId);
  });
  const hasNativeRevision = revisions.length > 0
    && beginMarkers.length > 0
    && linkedMarkers.length === markers.length
    && hasPairedMarkers;

  return {
    role,
    bytes,
    sha256: sha256(bytes),
    size: bytes.length,
    entryHashes,
    revisions,
    markers,
    changes,
    hasNativeRevision,
    documentText,
  };
}

function changedEntries(baseline, candidate) {
  const names = [...new Set([
    ...Object.keys(baseline.entryHashes),
    ...Object.keys(candidate.entryHashes),
  ])].sort();
  return names.filter(name =>
    baseline.entryHashes[name] !== candidate.entryHashes[name]);
}

function semanticRevision(packageInfo) {
  const changes = packageInfo.changes.map(change => ({
    type: change.type,
    author: change.author || null,
    text: change.text,
  }));
  const insertedText = changes
    .filter(change => change.type === 'Insert')
    .map(change => change.text)
    .join('');
  const deletedText = changes
    .filter(change => change.type === 'Delete')
    .map(change => change.text)
    .join('');
  const type = insertedText && deletedText
    ? 'Replace'
    : changes[0]?.type ?? null;
  return {
    type,
    author: changes[0]?.author ?? null,
    date: packageInfo.changes[0]?.date || null,
    text: insertedText || (type === 'Delete' ? deletedText : null),
    deletedText: deletedText || null,
    changes,
  };
}

function sameRevision(left, right) {
  return Boolean(left.type)
    && left.type === right.type
    && JSON.stringify(left.changes) === JSON.stringify(right.changes);
}

function acceptedMatchesRevision(packageInfo, revision) {
  if (packageInfo.hasNativeRevision || revision.changes.length === 0) return false;
  return revision.changes.every(change => change.type === 'Insert'
    ? packageInfo.documentText.includes(change.text)
    : !packageInfo.documentText.includes(change.text));
}

function rejectedMatchesRevision(packageInfo, revision) {
  if (packageInfo.hasNativeRevision || revision.changes.length === 0) return false;
  return revision.changes.every(change => change.type === 'Insert'
    ? !packageInfo.documentText.includes(change.text)
    : packageInfo.documentText.includes(change.text));
}

function unsupportedReason(checks) {
  if (!checks.trackedDiffersFromBaseline) {
    return 'tracked package does not differ from baseline';
  }
  if (!checks.trackedHasNativeRevision) {
    return 'tracked package has no internally linked native revision markup';
  }
  if (!checks.reopenedPreservesRevision) {
    return 'native revision markup or semantics did not survive Hancom reopen';
  }
  if (!checks.acceptedKeepsTextWithoutRevision) {
    return 'accepted package did not keep the tracked text while removing revision markup';
  }
  if (!checks.rejectedRemovesTextAndRevision) {
    return 'rejected package did not remove the tracked text and revision markup';
  }
  return 'probe evidence is incomplete';
}

function normalizeInput(value, role) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { bytes: Buffer.from(value), name: `${role}.hwpx` };
  }
  if (value && (Buffer.isBuffer(value.bytes) || value.bytes instanceof Uint8Array)) {
    return {
      bytes: Buffer.from(value.bytes),
      name: value.name ?? `${role}.hwpx`,
    };
  }
  throw new TypeError(`${role} must be HWPX bytes or { bytes, name }`);
}

export function analyzeTrackedChangeProbe(input) {
  const packages = Object.fromEntries(ROLES.map(role => {
    const normalized = normalizeInput(input?.[role], role);
    return [role, {
      ...inspectPackage(normalized.bytes, role),
      name: normalized.name,
    }];
  }));
  const trackedRevision = semanticRevision(packages.tracked);
  const reopenedRevision = semanticRevision(packages.reopened);
  const checks = {
    trackedDiffersFromBaseline: packages.tracked.sha256 !== packages.baseline.sha256,
    trackedHasNativeRevision: packages.tracked.hasNativeRevision,
    reopenedPreservesRevision: packages.reopened.hasNativeRevision
      && sameRevision(trackedRevision, reopenedRevision),
    acceptedKeepsTextWithoutRevision: acceptedMatchesRevision(
      packages.accepted,
      trackedRevision,
    ),
    rejectedRemovesTextAndRevision: rejectedMatchesRevision(
      packages.rejected,
      trackedRevision,
    ),
  };
  const supported = Object.values(checks).every(Boolean);
  const evidence = ROLES.map(role => {
    const packageInfo = packages[role];
    return {
      role,
      file: packageInfo.name,
      sha256: packageInfo.sha256,
      size: packageInfo.size,
      entryCount: Object.keys(packageInfo.entryHashes).length,
      changedEntries: role === 'baseline'
        ? []
        : changedEntries(packages.baseline, packageInfo),
      nativeRevision: packageInfo.hasNativeRevision,
      revisionCount: packageInfo.revisions.length,
      markerCount: packageInfo.markers.length,
    };
  });

  return {
    schemaVersion: 1,
    representation: supported ? 'hwpx-xml' : 'external-or-unsupported',
    supported,
    reason: supported
      ? 'native HWPX revision markup survived reopen and matched accept/reject semantics'
      : unsupportedReason(checks),
    checks,
    revision: trackedRevision,
    observedMarkup: {
      header: ['hh:trackChanges', 'hh:trackChange', 'hh:trackChangeAuthors'],
      section: ['hp:insertBegin', 'hp:insertEnd', 'hp:deleteBegin', 'hp:deleteEnd'],
      linkage: 'section marker TcId references header trackChange id',
    },
    evidence,
  };
}

function parseCliArguments(argv) {
  const directoryIndex = argv.indexOf('--directory');
  if (directoryIndex === -1 || !argv[directoryIndex + 1]) {
    throw new Error('Usage: node hwpx-tracked-change-probe.mjs --directory <artifact-directory>');
  }
  return {
    directory: resolve(argv[directoryIndex + 1]),
  };
}

export async function runTrackedChangeProbeCli(argv = process.argv.slice(2)) {
  const { directory } = parseCliArguments(argv);
  const input = {};
  for (const role of ROLES) {
    const path = join(directory, `${role}.hwpx`);
    input[role] = {
      bytes: await readFile(path),
      name: basename(path),
    };
  }
  const result = analyzeTrackedChangeProbe(input);
  const outputPath = join(directory, 'capability.json');
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return { result, outputPath };
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  runTrackedChangeProbeCli()
    .then(({ result, outputPath }) => {
      process.stdout.write(`${JSON.stringify({ ...result, outputPath }, null, 2)}\n`);
      if (!result.supported) process.exitCode = 2;
    })
    .catch(error => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
