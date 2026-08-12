import { createHash } from 'node:crypto';

import { resolveHwpxCommand } from './hwpx-command-catalog.mjs';
import { createZip, readZip } from './hwpx-zip.mjs';

export const STRUCTURAL_EXPORT_OPS = new Set([
  'insertText',
  'deleteRange',
  'appendParagraph',
  'table.create',
  'table.insertCaption',
  'defineStyle',
  'applyStyle',
  'setRunStyle',
  'setParagraphStyle',
  'format.apply',
  'object.format',
  'table.structure',
  'paragraph.structure',
  'setDocumentMetadata',
  'setPageSetup',
  'setHeaderFooter',
  'insertFootnote',
]);

const REQUIRED_PACKAGE_ENTRIES = [
  'mimetype',
  'version.xml',
  'Contents/content.hpf',
  'Contents/header.xml',
  'settings.xml',
  'META-INF/container.xml',
  'META-INF/manifest.xml',
];

const STRUCTURAL_ENTRY_PATTERNS = [
  /^mimetype$/i,
  /^version\.xml$/i,
  /^settings\.xml$/i,
  /^Contents\//i,
  /^META-INF\//i,
  /^BinData\//i,
  /^Preview\//i,
];

const PROTECTED_XML_OBJECTS = new Set([
  'p',
  'tbl',
  'tr',
  'tc',
  'pic',
  'ole',
  'chart',
  'video',
  'container',
  'rect',
  'ellipse',
  'arc',
  'polygon',
  'curve',
  'line',
  'connectline',
  'group',
  'equation',
  'footnote',
  'endnote',
  'header',
  'footer',
  'fieldbegin',
  'fieldend',
  'bookmark',
]);

class HwpxPackagePolicyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'HwpxPackagePolicyError';
    this.code = code;
    this.details = details;
  }
}

function policyError(code, message, details = {}) {
  return new HwpxPackagePolicyError(code, message, details);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isSafeEntryPath(name) {
  return typeof name === 'string'
    && name.length > 0
    && !name.includes('\0')
    && !name.includes('\\')
    && !name.startsWith('/')
    && !/^[A-Za-z]:/.test(name)
    && !name.split('/').includes('..');
}

function compressionMethods(bufferLike) {
  const buffer = Buffer.from(bufferLike);
  let eocdOffset = -1;
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw policyError('HWPX_PACKAGE_INVALID', 'ZIP end of central directory was not found.');
  }
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);
  const methods = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw policyError('HWPX_PACKAGE_INVALID', 'Invalid ZIP central directory entry.');
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (!isSafeEntryPath(name)) {
      throw policyError(
        'HWPX_PACKAGE_ENTRY_PATH_INVALID',
        'HWPX ZIP entries must use safe relative forward-slash paths.',
        { name },
      );
    }
    if (methods.has(name)) {
      throw policyError(
        'HWPX_PACKAGE_DUPLICATE_ENTRY',
        'Duplicate ZIP entry names are not allowed in an HWPX package.',
        { name },
      );
    }
    methods.set(name, method);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return methods;
}

function parseAttributes(fragment) {
  const attributes = {};
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of fragment.matchAll(pattern)) {
    attributes[match[1]] = match[2] ?? match[3] ?? '';
  }
  return attributes;
}

function parseContentManifest(xml) {
  const manifestItems = {};
  const manifestIds = new Set();
  const manifestElements = [
    ...xml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?manifest\b/g),
  ];
  if (manifestElements.length !== 1) {
    throw policyError(
      'HWPX_PACKAGE_MANIFEST_INVALID',
      'Contents/content.hpf must contain exactly one OPF manifest element.',
      { count: manifestElements.length },
    );
  }
  const manifestMatch = xml.match(
    /<((?:[A-Za-z_][\w.-]*:)?manifest)\b[^>]*>([\s\S]*?)<\/\1\s*>/i,
  );
  const emptyManifest = /<(?:[A-Za-z_][\w.-]*:)?manifest\b[^>]*\/>/i.test(xml);
  if (!manifestMatch && !emptyManifest) {
    throw policyError(
      'HWPX_PACKAGE_MANIFEST_INVALID',
      'Contents/content.hpf does not contain an OPF manifest.',
    );
  }
  const manifestXml = manifestMatch?.[2] ?? '';
  const itemPattern = /<(?:[A-Za-z_][\w.-]*:)?item\b([^>]*)\/?>/g;
  for (const match of manifestXml.matchAll(itemPattern)) {
    const attributes = parseAttributes(match[1]);
    const href = attributes.href;
    if (!href) continue;
    const id = attributes.id ?? '';
    if (manifestItems[href] || (id && manifestIds.has(id))) {
      throw policyError(
        'HWPX_PACKAGE_MANIFEST_DUPLICATE',
        'Duplicate content manifest IDs or hrefs are not allowed.',
        { id, href },
      );
    }
    if (id) manifestIds.add(id);
    manifestItems[href] = {
      id,
      href,
      mediaType: attributes['media-type'] ?? '',
      embedded: attributes.isEmbeded !== '0',
    };
  }
  return manifestItems;
}

function isSafeOpaqueOverlay(name) {
  return isSafeEntryPath(name)
    && !STRUCTURAL_ENTRY_PATTERNS.some(pattern => pattern.test(name));
}

function isMutableStructuralEntry(name) {
  return /^Contents\/(?:header|section\d+|masterpage\d+)\.xml$/i.test(name)
    || name === 'Contents/content.hpf'
    || name === 'version.xml'
    || name === 'settings.xml'
    || name === 'Preview/PrvText.txt'
    || name === 'Preview/PrvImage.png';
}

function canonicalMediaType(value) {
  const mediaType = String(value ?? '').trim().toLowerCase();
  if (mediaType === 'image/jpg') return 'image/jpeg';
  return mediaType;
}

export function inspectHwpxStructuralReferencesXml(xml) {
  const objectCounts = {};
  const binaryReferenceCounts = {};
  for (const match of String(xml ?? '').matchAll(/<(?:[\w.-]+:)?([A-Za-z][\w.-]*)\b/g)) {
    const localName = match[1].toLowerCase();
    if (PROTECTED_XML_OBJECTS.has(localName)) {
      objectCounts[localName] = (objectCounts[localName] ?? 0) + 1;
    }
  }
  for (const match of String(xml ?? '').matchAll(/\b(?:binItemIDRef|binaryItemIDRef)="([^"]+)"/gi)) {
    const reference = match[1];
    binaryReferenceCounts[reference] = (binaryReferenceCounts[reference] ?? 0) + 1;
  }
  return { objectCounts, binaryReferenceCounts };
}

function inspectStructuralReferences(entries) {
  const combined = { objectCounts: {}, binaryReferenceCounts: {} };
  const xmlEntries = [...entries]
    .filter(([name]) =>
      /^Contents\/(?:header|section\d+|masterpage\d+)\.xml$/i.test(name));
  for (const [, bytes] of xmlEntries) {
    const current = inspectHwpxStructuralReferencesXml(bytes.toString('utf8'));
    for (const [kind, count] of Object.entries(current.objectCounts)) {
      combined.objectCounts[kind] = (combined.objectCounts[kind] ?? 0) + count;
    }
    for (const [reference, count] of Object.entries(current.binaryReferenceCounts)) {
      combined.binaryReferenceCounts[reference]
        = (combined.binaryReferenceCounts[reference] ?? 0) + count;
    }
  }
  return combined;
}

export function classifyHwpxCommands(commands) {
  if (!Array.isArray(commands)) {
    throw policyError('HWPX_COMMAND_BATCH_INVALID', 'commands must be an array.');
  }
  const reasons = commands
    .map(command => resolveHwpxCommand(command)?.op ?? command?.op)
    .filter(op => STRUCTURAL_EXPORT_OPS.has(op));
  return {
    mode: reasons.length > 0 ? 'structural-export' : 'patch-safe',
    reasons,
  };
}

export function inspectHwpxPackage(bytes) {
  let entries;
  try {
    entries = readZip(bytes);
  } catch (error) {
    throw policyError('HWPX_PACKAGE_INVALID', error.message, { cause: error.message });
  }
  const methods = compressionMethods(bytes);
  const inventoryEntries = [...entries].map(([name, data]) => ({
    name,
    size: data.length,
    sha256: sha256(data),
    compressionMethod: methods.get(name),
    stored: methods.get(name) === 0,
  }));
  const entriesByName = Object.fromEntries(
    inventoryEntries.map(entry => [entry.name, entry]),
  );
  const contentXml = entries.get('Contents/content.hpf')?.toString('utf8') ?? '';
  const structuralReferences = inspectStructuralReferences(entries);
  return {
    entries: inventoryEntries,
    entriesByName,
    manifestItems: parseContentManifest(contentXml),
    mimetype: entries.get('mimetype')?.toString('ascii') ?? null,
    structuralReferences,
  };
}

export function restoreExportOmittedEmbeddedEntries(sourceBytes, candidateBytes) {
  const source = inspectHwpxPackage(sourceBytes);
  let candidate = inspectHwpxPackage(candidateBytes);
  const sourceEntries = readZip(sourceBytes);
  const candidateEntries = readZip(candidateBytes);
  const restoredEntries = [];
  const candidateIds = new Set(
    Object.values(candidate.manifestItems).map(item => item.id).filter(Boolean),
  );
  let candidateContent = candidateEntries.get('Contents/content.hpf')?.toString('utf8') ?? '';

  const addCandidateManifestItem = (sourceItem) => {
    if (candidate.manifestItems[sourceItem.href] || !sourceItem.id
      || candidateIds.has(sourceItem.id)) {
      return false;
    }
    const manifestClose = candidateContent.match(
      /<\/((?:[A-Za-z_][\w.-]*:)?manifest)\s*>/i,
    );
    if (!manifestClose) return false;
    const prefix = manifestClose[1].includes(':')
      ? `${manifestClose[1].split(':', 1)[0]}:`
      : '';
    const escapeXml = value => String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    const itemXml = `<${prefix}item id="${escapeXml(sourceItem.id)}" href="${escapeXml(sourceItem.href)}" media-type="${escapeXml(sourceItem.mediaType)}" isEmbeded="1"/>`;
    const closeIndex = manifestClose.index;
    candidateContent = `${candidateContent.slice(0, closeIndex)}${itemXml}${candidateContent.slice(closeIndex)}`;
    candidateEntries.set('Contents/content.hpf', Buffer.from(candidateContent));
    candidateIds.add(sourceItem.id);
    return true;
  };

  for (const sourceItem of Object.values(source.manifestItems)) {
    if (!sourceItem.embedded || !sourceEntries.has(sourceItem.href)
      || candidateEntries.has(sourceItem.href)) {
      continue;
    }
    let candidateItem = candidate.manifestItems[sourceItem.href];
    if (!candidateItem && addCandidateManifestItem(sourceItem)) {
      candidate = inspectHwpxPackage(createZip([...candidateEntries.entries()]));
      candidateItem = candidate.manifestItems[sourceItem.href];
    }
    if (!candidateItem || !candidateItem.embedded
      || canonicalMediaType(candidateItem.mediaType)
        !== canonicalMediaType(sourceItem.mediaType)) {
      continue;
    }
    const bytes = sourceEntries.get(sourceItem.href);
    candidateEntries.set(sourceItem.href, bytes);
    restoredEntries.push({
      name: sourceItem.href,
      size: bytes.length,
      sha256: sha256(bytes),
    });
  }

  for (const sourceEntry of source.entries) {
    const candidateEntry = candidate.entriesByName[sourceEntry.name];
    if (!candidateEntry || candidateEntry.sha256 === sourceEntry.sha256
      || isMutableStructuralEntry(sourceEntry.name)) {
      continue;
    }
    const bytes = sourceEntries.get(sourceEntry.name);
    candidateEntries.set(sourceEntry.name, bytes);
    if (!restoredEntries.some(entry => entry.name === sourceEntry.name)) {
      restoredEntries.push({
        name: sourceEntry.name,
        size: bytes.length,
        sha256: sha256(bytes),
      });
    }
  }

  return {
    bytes: restoredEntries.length > 0
      ? createZip([...candidateEntries.entries()])
      : Buffer.from(candidateBytes),
    restoredEntries,
  };
}

export function qualifyHwpxCandidate(sourceBytes, candidateBytes, options = {}) {
  const source = inspectHwpxPackage(sourceBytes);
  const candidate = inspectHwpxPackage(candidateBytes);
  const sourceNames = new Set(source.entries.map(entry => entry.name));
  const candidateNames = new Set(candidate.entries.map(entry => entry.name));

  if (candidate.mimetype !== 'application/hwp+zip'
    || candidate.entriesByName.mimetype?.stored !== true) {
    throw policyError(
      'HWPX_PACKAGE_MIMETYPE_INVALID',
      'The HWPX mimetype must be application/hwp+zip and stored without compression.',
      {
        mimetype: candidate.mimetype,
        stored: candidate.entriesByName.mimetype?.stored ?? false,
      },
    );
  }

  const missingRequired = REQUIRED_PACKAGE_ENTRIES.filter(name => !candidateNames.has(name));
  if (![...candidateNames].some(name => /^Contents\/section\d+\.xml$/i.test(name))) {
    missingRequired.push('Contents/section*.xml');
  }
  if (missingRequired.length > 0) {
    throw policyError(
      'HWPX_PACKAGE_REQUIRED_ENTRY_MISSING',
      'The candidate is missing required HWPX package entries.',
      { entries: missingRequired },
    );
  }

  const lostEmbedded = Object.values(source.manifestItems)
    .filter(item => item.embedded && sourceNames.has(item.href))
    .map(item => item.href)
    .filter(name => !candidateNames.has(name));
  if (lostEmbedded.length > 0) {
    throw policyError(
      'HWPX_PACKAGE_ENTRY_LOSS',
      'The candidate lost embedded package objects.',
      { entries: lostEmbedded },
    );
  }

  const lostStructuralEntries = source.entries
    .map(entry => entry.name)
    .filter(name => !candidateNames.has(name))
    .filter(name => !isSafeOpaqueOverlay(name));
  if (lostStructuralEntries.length > 0) {
    throw policyError(
      'HWPX_PACKAGE_STRUCTURAL_ENTRY_LOSS',
      'The candidate lost structural, relationship, preview, or binary package entries.',
      { entries: lostStructuralEntries },
    );
  }

  const lostRelationships = Object.values(source.manifestItems)
    .filter(item => item.embedded && sourceNames.has(item.href))
    .map(item => item.href)
    .filter(href => candidateNames.has(href))
    .filter(href => !candidate.manifestItems[href]);
  if (lostRelationships.length > 0) {
    throw policyError(
      'HWPX_PACKAGE_RELATIONSHIP_LOSS',
      'The candidate kept package bytes but lost their content manifest relationships.',
      { entries: lostRelationships },
    );
  }

  const embeddedRelationshipChanges = Object.values(source.manifestItems)
    .filter(item => item.embedded)
    .filter(item => candidate.manifestItems[item.href])
    .filter(item => candidate.manifestItems[item.href].embedded !== true)
    .map(item => item.href);
  if (embeddedRelationshipChanges.length > 0) {
    throw policyError(
      'HWPX_PACKAGE_EMBEDDED_RELATIONSHIP_CHANGED',
      'Existing embedded relationships must remain embedded in the candidate.',
      { entries: embeddedRelationshipChanges },
    );
  }

  const danglingManifest = Object.values(candidate.manifestItems)
    .filter(item => item.embedded && !candidateNames.has(item.href))
    .map(item => item.href);
  if (danglingManifest.length > 0) {
    throw policyError(
      'HWPX_PACKAGE_MANIFEST_DANGLING',
      'The candidate content manifest references missing embedded entries.',
      { entries: danglingManifest },
    );
  }

  const allowedObjectLosses = options.allowedStructuralReferenceLosses?.objectCounts ?? {};
  const allowedBinaryReferenceLosses
    = options.allowedStructuralReferenceLosses?.binaryReferenceCounts ?? {};
  const intentionalObjectReferenceLosses = [];
  const lostObjectReferences = [];
  for (const [kind, sourceCount] of Object.entries(
    source.structuralReferences.objectCounts,
  )) {
    const candidateCount = candidate.structuralReferences.objectCounts[kind] ?? 0;
    if (candidateCount < sourceCount) {
      const lost = sourceCount - candidateCount;
      const allowed = Number(allowedObjectLosses[kind] ?? 0);
      const detail = {
        kind,
        source: sourceCount,
        candidate: candidateCount,
        lost,
        allowed,
      };
      if (lost > allowed) lostObjectReferences.push(detail);
      else intentionalObjectReferenceLosses.push(detail);
    }
  }
  for (const [reference, sourceCount] of Object.entries(
    source.structuralReferences.binaryReferenceCounts,
  )) {
    const candidateCount =
      candidate.structuralReferences.binaryReferenceCounts[reference] ?? 0;
    if (candidateCount < sourceCount) {
      const lost = sourceCount - candidateCount;
      const allowed = Number(allowedBinaryReferenceLosses[reference] ?? 0);
      const detail = {
        kind: 'binary-reference',
        reference,
        source: sourceCount,
        candidate: candidateCount,
        lost,
        allowed,
      };
      if (lost > allowed) lostObjectReferences.push(detail);
      else intentionalObjectReferenceLosses.push(detail);
    }
  }
  if (lostObjectReferences.length > 0) {
    throw policyError(
      'HWPX_PACKAGE_OBJECT_REFERENCE_LOSS',
      'The candidate lost structural XML objects or embedded binary references.',
      { objects: lostObjectReferences },
    );
  }

  const createdEntries = candidate.entries
    .map(entry => entry.name)
    .filter(name => !sourceNames.has(name));
  const unrelatedCreatedEntries = createdEntries.filter((name) => {
    const item = candidate.manifestItems[name];
    if (/^BinData\//i.test(name)) {
      return !item || !item.embedded || item.mediaType.length === 0;
    }
    if (/^Contents\/(?:section|masterpage)\d+\.xml$/i.test(name)) {
      return !item || !item.embedded || item.mediaType !== 'application/xml';
    }
    return ![
      'Preview/PrvText.txt',
      'Preview/PrvImage.png',
      'META-INF/container.rdf',
    ].includes(name);
  });
  if (unrelatedCreatedEntries.length > 0) {
    throw policyError(
      'HWPX_PACKAGE_CREATED_ENTRY_UNRELATED',
      'New package entries must be standard generated assets or unique manifest relationships.',
      { entries: unrelatedCreatedEntries },
    );
  }

  const mediaDrift = [];
  for (const [href, sourceItem] of Object.entries(source.manifestItems)) {
    const candidateItem = candidate.manifestItems[href];
    if (candidateItem
      && canonicalMediaType(candidateItem.mediaType)
        !== canonicalMediaType(sourceItem.mediaType)) {
      mediaDrift.push({
        href,
        source: sourceItem.mediaType,
        candidate: candidateItem.mediaType,
      });
    }
  }
  if (mediaDrift.length > 0) {
    throw policyError(
      'HWPX_PACKAGE_MEDIA_TYPE_CHANGED',
      'The candidate changed package media types without an explicit delta.',
      { entries: mediaDrift },
    );
  }

  const collisions = source.entries
    .filter(sourceEntry => candidateNames.has(sourceEntry.name))
    .filter(sourceEntry =>
      candidate.entriesByName[sourceEntry.name].sha256 !== sourceEntry.sha256)
    .map(entry => entry.name)
    .filter(name => !isMutableStructuralEntry(name));
  if (collisions.length > 0) {
    throw policyError(
      'HWPX_PACKAGE_ENTRY_COLLISION',
      'The candidate changed opaque or binary entries without an explicit delta.',
      { entries: collisions },
    );
  }

  const preservableEntries = source.entries
    .map(entry => entry.name)
    .filter(name => !candidateNames.has(name))
    .filter(isSafeOpaqueOverlay);

  return {
    ok: true,
    deletedEntries: [],
    createdEntries,
    changedEntries: source.entries
      .map(entry => entry.name)
      .filter(name => candidateNames.has(name))
      .filter(name =>
        candidate.entriesByName[name].sha256 !== source.entriesByName[name].sha256),
    preservableEntries,
    copiedEntries: [],
    sourceEntryCount: source.entries.length,
    candidateEntryCount: candidate.entries.length,
    intentionalObjectReferenceLosses,
  };
}

export function overlayPreservedEntries(sourceBytes, candidateBytes, qualification) {
  if (!qualification || qualification.ok !== true
    || !Array.isArray(qualification.preservableEntries)) {
    throw policyError(
      'HWPX_PACKAGE_QUALIFICATION_REQUIRED',
      'A successful package qualification is required before overlay.',
    );
  }
  const unsafe = qualification.preservableEntries.filter(name => !isSafeOpaqueOverlay(name));
  if (unsafe.length > 0) {
    throw policyError(
      'HWPX_PACKAGE_UNSAFE_OVERLAY',
      'Structural, relationship, and binary package entries cannot be overlaid.',
      { entries: unsafe },
    );
  }

  const sourceEntries = readZip(sourceBytes);
  const candidateEntries = readZip(candidateBytes);
  const copiedEntries = [];
  for (const name of qualification.preservableEntries) {
    if (!sourceEntries.has(name) || candidateEntries.has(name)) {
      throw policyError(
        'HWPX_PACKAGE_OVERLAY_CONFLICT',
        'An overlay entry is missing from the source or already exists in the candidate.',
        { name },
      );
    }
    const bytes = sourceEntries.get(name);
    candidateEntries.set(name, bytes);
    copiedEntries.push({
      name,
      size: bytes.length,
      sha256: sha256(bytes),
    });
  }
  qualification.copiedEntries.splice(0, qualification.copiedEntries.length, ...copiedEntries);
  return createZip([...candidateEntries.entries()]);
}
