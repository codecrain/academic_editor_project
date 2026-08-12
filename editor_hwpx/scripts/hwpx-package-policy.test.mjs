import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createZip, readZip } from './hwpx-api-utils.mjs';
import { HWPX_COMMAND_CATALOG } from './hwpx-command-catalog.mjs';
import {
  classifyHwpxCommands,
  inspectHwpxPackage,
  overlayPreservedEntries,
  qualifyHwpxCandidate,
  restoreExportOmittedEmbeddedEntries,
} from './hwpx-package-policy.mjs';

function packageBytes(extraEntries = [], manifestItems = []) {
  const allManifestItems = [
    { id: 'header', href: 'Contents/header.xml', mediaType: 'application/xml' },
    { id: 'section0', href: 'Contents/section0.xml', mediaType: 'application/xml' },
    { id: 'settings', href: 'settings.xml', mediaType: 'application/xml' },
    ...manifestItems,
  ];
  const itemXml = allManifestItems.map(item =>
    `<opf:item id="${item.id}" href="${item.href}" media-type="${item.mediaType}" isEmbeded="${item.embedded === false ? 0 : 1}"/>`)
    .join('');
  return createZip([
    ['mimetype', Buffer.from('application/hwp+zip')],
    ['version.xml', Buffer.from('<version/>')],
    ['Contents/content.hpf', Buffer.from(
      `<opf:package xmlns:opf="http://www.idpf.org/2007/opf/"><opf:metadata/><opf:manifest>${itemXml}</opf:manifest><opf:spine/></opf:package>`,
    )],
    ['Contents/header.xml', Buffer.from('<hh:head xmlns:hh="urn:test"/>')],
    ['Contents/section0.xml', Buffer.from('<hs:sec xmlns:hs="urn:test"/>')],
    ['settings.xml', Buffer.from('<settings/>')],
    ['META-INF/container.xml', Buffer.from('<container/>')],
    ['META-INF/manifest.xml', Buffer.from('<manifest/>')],
    ...extraEntries,
  ]);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('command classification separates patch-safe and RHWP structural export operations', () => {
  assert.deepEqual(classifyHwpxCommands([
    { op: 'text.replace' },
    { op: 'table.writeCell' },
  ]), {
    mode: 'patch-safe',
    reasons: [],
  });
  assert.deepEqual(classifyHwpxCommands([
    { op: 'text.replace' },
    { op: 'insertText' },
    { op: 'table.create' },
    { op: 'setDocumentMetadata' },
  ]), {
    mode: 'structural-export',
    reasons: ['insertText', 'table.create', 'setDocumentMetadata'],
  });
  assert.deepEqual(classifyHwpxCommands([
    { op: 'insertText' },
    { op: 'image.insertAfterParagraph' },
  ]), {
    mode: 'structural-export',
    reasons: ['insertText'],
  });
  const promoted = HWPX_COMMAND_CATALOG
    .filter(command => command.execution === 'structural-adapter')
    .map(command => ({ op: command.op }));
  assert.deepEqual(
    classifyHwpxCommands(promoted).reasons,
    promoted.map(command => command.op),
  );
});

test('package inventory records entries, content manifest media types, and hashes', () => {
  const bytes = packageBytes([
    ['BinData/image1.png', Buffer.from('png-data')],
    ['BinData/ole1.bin', Buffer.from('opaque-attachment')],
  ], [
    { id: 'image1', href: 'BinData/image1.png', mediaType: 'image/png' },
    { id: 'ole1', href: 'BinData/ole1.bin', mediaType: 'application/ole' },
  ]);

  const inventory = inspectHwpxPackage(bytes);
  assert.equal(inventory.entries.length, 10);
  assert.equal(inventory.entriesByName['mimetype'].stored, true);
  assert.equal(inventory.entriesByName['BinData/image1.png'].sha256, sha256('png-data'));
  assert.deepEqual(inventory.manifestItems['BinData/ole1.bin'], {
    id: 'ole1',
    href: 'BinData/ole1.bin',
    mediaType: 'application/ole',
    embedded: true,
  });
});

test('package inventory rejects duplicate ZIP entry names', () => {
  const duplicate = createZip([
    ['mimetype', Buffer.from('application/hwp+zip')],
    ['mimetype', Buffer.from('application/evil')],
  ]);
  assert.throws(
    () => inspectHwpxPackage(duplicate),
    error => error.code === 'HWPX_PACKAGE_DUPLICATE_ENTRY',
  );
});

test('package inventory rejects unsafe ZIP paths and duplicate manifest relationships', () => {
  const unsafePath = packageBytes([
    ['../outside.bin', Buffer.from('escape')],
  ]);
  assert.throws(
    () => inspectHwpxPackage(unsafePath),
    error => error.code === 'HWPX_PACKAGE_ENTRY_PATH_INVALID',
  );

  const duplicateRelationship = packageBytes([
    ['BinData/image1.png', Buffer.from('image')],
  ], [
    { id: 'image1', href: 'BinData/image1.png', mediaType: 'image/png' },
    { id: 'image2', href: 'BinData/image1.png', mediaType: 'image/png' },
  ]);
  assert.throws(
    () => inspectHwpxPackage(duplicateRelationship),
    error => error.code === 'HWPX_PACKAGE_MANIFEST_DUPLICATE',
  );

  const outsideManifest = packageBytes();
  const entries = readZip(outsideManifest);
  entries.set('Contents/content.hpf', Buffer.from(
    '<opf:package xmlns:opf="urn:test"><opf:item id="fake" href="BinData/fake.bin" media-type="image/png"/><opf:manifest/></opf:package>',
  ));
  const inventory = inspectHwpxPackage(createZip([...entries]));
  assert.equal(inventory.manifestItems['BinData/fake.bin'], undefined);
});

test('qualification rejects embedded object loss and caller-forged deltas', () => {
  const source = packageBytes([
    ['BinData/ole1.bin', Buffer.from('opaque-attachment')],
  ], [
    { id: 'ole1', href: 'BinData/ole1.bin', mediaType: 'application/ole' },
  ]);
  const candidate = packageBytes();

  assert.throws(
    () => qualifyHwpxCandidate(source, candidate),
    error => error.code === 'HWPX_PACKAGE_ENTRY_LOSS'
      && error.details.entries.includes('BinData/ole1.bin'),
  );
  assert.throws(
    () => qualifyHwpxCandidate(source, candidate, {
      deletedEntries: ['BinData/ole1.bin'],
    }),
    error => error.code === 'HWPX_PACKAGE_ENTRY_LOSS',
  );

  const referencedSourceEntries = readZip(packageBytes([
    ['BinData/image1.png', Buffer.from('same-image')],
  ], [
    { id: 'image1', href: 'BinData/image1.png', mediaType: 'image/png' },
  ]));
  referencedSourceEntries.set('Contents/section0.xml', Buffer.from(
    '<hs:sec xmlns:hs="urn:test" xmlns:hp="urn:shape"><hp:pic><hp:img binItemIDRef="image1"/></hp:pic><hp:pic><hp:img binItemIDRef="image1"/></hp:pic></hs:sec>',
  ));
  const referencedCandidateEntries = new Map(referencedSourceEntries);
  referencedCandidateEntries.set('Contents/section0.xml', Buffer.from(
    '<hs:sec xmlns:hs="urn:test" xmlns:hp="urn:shape"><hp:pic><hp:img binItemIDRef="image1"/></hp:pic></hs:sec>',
  ));
  assert.throws(
    () => qualifyHwpxCandidate(
      createZip([...referencedSourceEntries]),
      createZip([...referencedCandidateEntries]),
    ),
    error => error.code === 'HWPX_PACKAGE_OBJECT_REFERENCE_LOSS'
      && error.details.objects.some(item =>
        item.kind === 'pic' && item.source === 2 && item.candidate === 1),
  );

  const tableSourceEntries = readZip(packageBytes());
  tableSourceEntries.set('Contents/section0.xml', Buffer.from(
    '<hs:sec xmlns:hs="urn:test" xmlns:hp="urn:shape"><hp:tbl><hp:tr><hp:tc><hp:p/></hp:tc><hp:tc><hp:p/></hp:tc></hp:tr></hp:tbl><hp:p/></hs:sec>',
  ));
  const tableCandidateEntries = new Map(tableSourceEntries);
  tableCandidateEntries.set('Contents/section0.xml', Buffer.from(
    '<hs:sec xmlns:hs="urn:test" xmlns:hp="urn:shape"><hp:tbl><hp:tr><hp:tc><hp:p/></hp:tc></hp:tr></hp:tbl><hp:p/><hp:p/></hs:sec>',
  ));
  assert.throws(
    () => qualifyHwpxCandidate(
      createZip([...tableSourceEntries]),
      createZip([...tableCandidateEntries]),
    ),
    error => error.code === 'HWPX_PACKAGE_OBJECT_REFERENCE_LOSS'
      && error.details.objects.some(item =>
        item.kind === 'tc' && item.source === 2 && item.candidate === 1),
  );

  const intentionalTableDelete = qualifyHwpxCandidate(
    createZip([...tableSourceEntries]),
    createZip([...tableCandidateEntries]),
    {
      allowedStructuralReferenceLosses: {
        objectCounts: { tc: 1 },
        binaryReferenceCounts: {},
      },
    },
  );
  assert.equal(intentionalTableDelete.ok, true);
  assert.deepEqual(intentionalTableDelete.intentionalObjectReferenceLosses, [{
    kind: 'tc', source: 2, candidate: 1, lost: 1, allowed: 1,
  }]);

  assert.throws(
    () => qualifyHwpxCandidate(
      createZip([...tableSourceEntries]),
      createZip([...tableCandidateEntries]),
      {
        allowedStructuralReferenceLosses: {
          objectCounts: { p: 99 },
          binaryReferenceCounts: {},
        },
      },
    ),
    error => error.code === 'HWPX_PACKAGE_OBJECT_REFERENCE_LOSS'
      && error.details.objects.some(item => item.kind === 'tc' && item.allowed === 0),
  );
});

test('structural export restores exact source bytes only for preserved embedded relationships', () => {
  const source = packageBytes([
    ['BinData/ole1.bin', Buffer.from('opaque-attachment')],
  ], [
    { id: 'ole1', href: 'BinData/ole1.bin', mediaType: 'application/ole' },
  ]);
  const candidate = packageBytes([], [
    { id: 'ole1', href: 'BinData/ole1.bin', mediaType: 'application/ole' },
  ]);

  const restored = restoreExportOmittedEmbeddedEntries(source, candidate);
  const entries = readZip(restored.bytes);

  assert.deepEqual(restored.restoredEntries.map(item => item.name), [
    'BinData/ole1.bin',
  ]);
  assert.equal(entries.get('BinData/ole1.bin').toString(), 'opaque-attachment');
  assert.equal(qualifyHwpxCandidate(source, restored.bytes).ok, true);

  const withoutRelationship = packageBytes();
  const restoredRelationship = restoreExportOmittedEmbeddedEntries(
    source,
    withoutRelationship,
  );
  const restoredInventory = inspectHwpxPackage(restoredRelationship.bytes);
  assert.equal(
    restoredInventory.manifestItems['BinData/ole1.bin'].mediaType,
    'application/ole',
  );
  assert.equal(qualifyHwpxCandidate(source, restoredRelationship.bytes).ok, true);

  const changedContainerEntries = readZip(source);
  changedContainerEntries.set(
    'META-INF/container.xml',
    Buffer.from('<container regenerated="true"/>'),
  );
  const restoredContainer = restoreExportOmittedEmbeddedEntries(
    source,
    createZip([...changedContainerEntries]),
  );
  assert.equal(
    readZip(restoredContainer.bytes).get('META-INF/container.xml').toString(),
    '<container/>',
  );
});

test('qualification rejects required entry loss, media-type drift, and undeclared collisions', () => {
  const source = packageBytes([
    ['BinData/image1.png', Buffer.from('old')],
    ['Custom/audit.bin', Buffer.from('source-only')],
  ], [
    { id: 'image1', href: 'BinData/image1.png', mediaType: 'image/png' },
  ]);
  const noHeaderEntries = [...readZip(source).entries()].filter(([name]) =>
    name !== 'Contents/header.xml');
  assert.throws(
    () => qualifyHwpxCandidate(source, createZip(noHeaderEntries)),
    error => error.code === 'HWPX_PACKAGE_REQUIRED_ENTRY_MISSING',
  );

  const mediaDrift = packageBytes([
    ['BinData/image1.png', Buffer.from('old')],
  ], [
    { id: 'image1', href: 'BinData/image1.png', mediaType: 'image/jpeg' },
  ]);
  assert.throws(
    () => qualifyHwpxCandidate(source, mediaDrift),
    error => error.code === 'HWPX_PACKAGE_MEDIA_TYPE_CHANGED',
  );

  const jpgAliasSource = packageBytes([
    ['BinData/image1.jpg', Buffer.from('same-jpeg')],
  ], [
    { id: 'image1', href: 'BinData/image1.jpg', mediaType: 'image/jpg' },
  ]);
  const jpegAliasCandidate = packageBytes([
    ['BinData/image1.jpg', Buffer.from('same-jpeg')],
  ], [
    { id: 'image1', href: 'BinData/image1.jpg', mediaType: 'image/jpeg' },
  ]);
  assert.equal(
    qualifyHwpxCandidate(jpgAliasSource, jpegAliasCandidate).ok,
    true,
  );

  const collision = packageBytes([
    ['BinData/image1.png', Buffer.from('old')],
    ['Custom/audit.bin', Buffer.from('candidate-different')],
  ], [
    { id: 'image1', href: 'BinData/image1.png', mediaType: 'image/png' },
  ]);
  assert.throws(
    () => qualifyHwpxCandidate(source, collision),
    error => error.code === 'HWPX_PACKAGE_ENTRY_COLLISION',
  );

  const generatedEntries = readZip(packageBytes());
  generatedEntries.set('version.xml', Buffer.from('<version target-application="RHWP"/>'));
  const generated = qualifyHwpxCandidate(
    packageBytes(),
    createZip([...generatedEntries]),
  );
  assert.ok(generated.changedEntries.includes('version.xml'));
});

test('qualification rejects manifest relationship loss and dangling manifest entries', () => {
  const source = packageBytes([
    ['BinData/image1.png', Buffer.from('old')],
  ], [
    { id: 'image1', href: 'BinData/image1.png', mediaType: 'image/png' },
  ]);
  const orphanedBinary = packageBytes([
    ['BinData/image1.png', Buffer.from('old')],
  ]);
  assert.throws(
    () => qualifyHwpxCandidate(source, orphanedBinary),
    error => error.code === 'HWPX_PACKAGE_RELATIONSHIP_LOSS',
  );

  const danglingManifest = packageBytes([], [
    { id: 'image1', href: 'BinData/image1.png', mediaType: 'image/png' },
  ]);
  assert.throws(
    () => qualifyHwpxCandidate(packageBytes(), danglingManifest, {
      createdEntries: ['BinData/image1.png'],
    }),
    error => error.code === 'HWPX_PACKAGE_MANIFEST_DANGLING',
  );
  assert.throws(
    () => qualifyHwpxCandidate(packageBytes(), danglingManifest),
    error => error.code === 'HWPX_PACKAGE_MANIFEST_DANGLING',
  );

  const embeddedSource = packageBytes([
    ['BinData/image1.png', Buffer.from('old')],
  ], [
    { id: 'image1', href: 'BinData/image1.png', mediaType: 'image/png' },
  ]);
  const downgraded = packageBytes([
    ['BinData/image1.png', Buffer.from('old')],
  ], [
    {
      id: 'image1',
      href: 'BinData/image1.png',
      mediaType: 'image/png',
      embedded: false,
    },
  ]);
  assert.throws(
    () => qualifyHwpxCandidate(embeddedSource, downgraded),
    error => error.code === 'HWPX_PACKAGE_EMBEDDED_RELATIONSHIP_CHANGED',
  );
});

test('qualification derives exact new BinData entries from package and manifest diff', () => {
  const source = packageBytes();
  const candidate = packageBytes([
    ['BinData/image1.png', Buffer.from('new-image')],
  ], [
    { id: 'image1', href: 'BinData/image1.png', mediaType: 'image/png' },
  ]);
  const qualification = qualifyHwpxCandidate(source, candidate);
  assert.deepEqual(qualification.createdEntries, ['BinData/image1.png']);

  const unrelated = packageBytes([
    ['BinData/orphan.bin', Buffer.from('not-related')],
  ]);
  assert.throws(
    () => qualifyHwpxCandidate(source, unrelated),
    error => error.code === 'HWPX_PACKAGE_CREATED_ENTRY_UNRELATED',
  );
});

test('qualification overlays only safe opaque source entries without changing binaries', () => {
  const source = packageBytes([
    ['BinData/image1.png', Buffer.from('old')],
    ['Custom/audit.bin', Buffer.from('preserve-me')],
    ['Scripts/sourceScripts.xml', Buffer.from('<script/>')],
  ], [
    { id: 'image1', href: 'BinData/image1.png', mediaType: 'image/png' },
  ]);
  const candidate = packageBytes([
    ['BinData/image1.png', Buffer.from('old')],
  ], [
    { id: 'image1', href: 'BinData/image1.png', mediaType: 'image/png' },
  ]);

  const qualification = qualifyHwpxCandidate(source, candidate);
  assert.deepEqual(qualification.preservableEntries.sort(), [
    'Custom/audit.bin',
    'Scripts/sourceScripts.xml',
  ]);

  const overlaid = overlayPreservedEntries(source, candidate, qualification);
  const entries = readZip(overlaid);
  assert.equal(entries.get('BinData/image1.png').toString(), 'old');
  assert.equal(entries.get('Custom/audit.bin').toString(), 'preserve-me');
  assert.equal(entries.get('Scripts/sourceScripts.xml').toString(), '<script/>');
  assert.deepEqual(
    qualification.copiedEntries.map(entry => entry.name).sort(),
    ['Custom/audit.bin', 'Scripts/sourceScripts.xml'],
  );
  for (const copied of qualification.copiedEntries) {
    assert.equal(copied.sha256, sha256(entries.get(copied.name)));
  }
});

test('overlay rejects relationship and structural XML injection even if requested', () => {
  const source = packageBytes([
    ['Contents/section9.xml', Buffer.from('<source-only-section/>')],
    ['META-INF/vendor-rel.xml', Buffer.from('<relationship/>')],
  ]);
  const candidate = packageBytes();
  assert.throws(
    () => qualifyHwpxCandidate(source, candidate),
    error => error.code === 'HWPX_PACKAGE_STRUCTURAL_ENTRY_LOSS',
  );

  assert.throws(
    () => overlayPreservedEntries(source, candidate, {
      ok: true,
      preservableEntries: ['Contents/section9.xml'],
      copiedEntries: [],
    }),
    error => error.code === 'HWPX_PACKAGE_UNSAFE_OVERLAY',
  );
});

test('qualification enforces the canonical uncompressed HWPX mimetype', () => {
  const source = packageBytes();
  const entries = readZip(source);
  entries.set('mimetype', Buffer.from('application/zip'));
  const candidate = createZip([...entries]);
  assert.throws(
    () => qualifyHwpxCandidate(source, candidate),
    error => error.code === 'HWPX_PACKAGE_MIMETYPE_INVALID',
  );
});

test('package inventory rejects multiple content manifest elements', () => {
  const source = packageBytes();
  const entries = readZip(source);
  entries.set('Contents/content.hpf', Buffer.from(
    '<opf:package xmlns:opf="urn:test"><opf:manifest/><opf:manifest/></opf:package>',
  ));
  assert.throws(
    () => inspectHwpxPackage(createZip([...entries])),
    error => error.code === 'HWPX_PACKAGE_MANIFEST_INVALID',
  );
});
