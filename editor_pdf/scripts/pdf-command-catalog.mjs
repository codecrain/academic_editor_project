const PDF_COMMANDS = Object.freeze([
  {
    op: 'text.add',
    category: 'text',
    summary: 'Add positioned Unicode text with an embedded approved open font.',
    required: ['page', 'x', 'y', 'text'],
    precondition: 'none',
    example: { op: 'text.add', page: 1, x: 72, y: 96, text: '검토 완료', fontFamily: 'Noto Sans KR', fontSize: 14, color: '#172033' },
  },
  {
    op: 'text.replaceObject',
    category: 'text',
    summary: 'Replace an existing PDF text object, optionally embedding an approved open font and changing its size or color.',
    required: ['page', 'objectIndex', 'objectId', 'expectedText', 'text'],
    precondition: 'target_inspect',
    example: { op: 'text.replaceObject', page: 1, objectIndex: 3, objectId: 'pdf-object-1-3-text-...', expectedText: 'Original', text: '수정된 본문', fontFamily: 'Noto Sans KR', fontSize: 12, color: '#172033' },
  },
  {
    op: 'highlight.add',
    category: 'annotation',
    summary: 'Add a translucent highlight rectangle.',
    required: ['page', 'x', 'y', 'width', 'height'],
    precondition: 'none',
    example: { op: 'highlight.add', page: 1, x: 72, y: 120, width: 180, height: 18, color: '#ffe066', opacity: 0.42 },
  },
  {
    op: 'ink.add',
    category: 'annotation',
    summary: 'Add a freehand ink path.',
    required: ['page', 'points'],
    precondition: 'none',
    example: { op: 'ink.add', page: 1, points: [{ x: 72, y: 180 }, { x: 88, y: 176 }], color: '#172033', thickness: 2 },
  },
  {
    op: 'image.add',
    category: 'image',
    summary: 'Add a PNG or JPEG image to one page.',
    required: ['page', 'x', 'y', 'width', 'height', 'bytesBase64', 'mimeType'],
    precondition: 'none',
    example: { op: 'image.add', page: 1, x: 72, y: 220, width: 144, height: 72, mimeType: 'image/png', bytesBase64: '<trusted image bytes>' },
  },
  {
    op: 'image.replaceObject',
    category: 'image',
    summary: 'Replace the encoded PNG or JPEG data of an existing image object while preserving its placement.',
    required: ['page', 'objectIndex', 'objectId', 'bytesBase64', 'mimeType'],
    precondition: 'target_inspect',
    example: { op: 'image.replaceObject', page: 1, objectIndex: 5, objectId: 'pdf-object-1-5-image-...', mimeType: 'image/png', bytesBase64: '<trusted image bytes>' },
  },
  {
    op: 'object.transform',
    category: 'object',
    summary: 'Move, scale, rotate, or skew an existing page object with an explicit PDF transformation matrix.',
    required: ['page', 'objectIndex', 'objectId', 'matrix'],
    precondition: 'target_inspect',
    example: { op: 'object.transform', page: 1, objectIndex: 5, objectId: 'pdf-object-1-5-image-...', matrix: { a: 120, b: 0, c: 0, d: 60, e: 72, f: 600 } },
  },
  {
    op: 'object.delete',
    category: 'object',
    summary: 'Delete one inspected text, image, path, shading, or form page object.',
    required: ['page', 'objectIndex', 'objectId'],
    precondition: 'target_inspect',
    example: { op: 'object.delete', page: 1, objectIndex: 5, objectId: 'pdf-object-1-5-image-...' },
  },
  {
    op: 'signature.addAppearance',
    category: 'signature',
    summary: 'Add a visible handwritten signature appearance. This is not a certificate-backed digital signature.',
    required: ['page', 'x', 'y', 'width', 'height', 'bytesBase64', 'mimeType'],
    precondition: 'none',
    example: { op: 'signature.addAppearance', page: 1, x: 360, y: 650, width: 120, height: 48, mimeType: 'image/png', bytesBase64: '<trusted signature image bytes>' },
  },
  {
    op: 'signature.addDigital',
    category: 'signature',
    summary: 'Apply a final certificate-backed PAdES signature from a PKCS#12 credential.',
    required: ['p12BytesBase64'],
    precondition: 'none',
    example: { op: 'signature.addDigital', p12BytesBase64: '<local .p12/.pfx bytes>', password: '<credential password>', reason: 'Document approved', location: 'Seoul' },
  },
  {
    op: 'page.rotate',
    category: 'page',
    summary: 'Rotate one page clockwise by a multiple of 90 degrees.',
    required: ['page', 'degrees'],
    precondition: 'none',
    example: { op: 'page.rotate', page: 1, degrees: 90 },
  },
  {
    op: 'page.add',
    category: 'page',
    summary: 'Insert a blank A4, Letter, Legal, or custom-sized page.',
    required: [],
    precondition: 'none',
    example: { op: 'page.add', insertAt: 2, size: 'a4', orientation: 'portrait' },
  },
  {
    op: 'page.delete',
    category: 'page',
    summary: 'Delete one page. Deleting the final remaining page is rejected.',
    required: ['page'],
    precondition: 'none',
    example: { op: 'page.delete', page: 2 },
  },
  {
    op: 'page.duplicate',
    category: 'page',
    summary: 'Duplicate one page, including its content and resources.',
    required: ['page'],
    precondition: 'none',
    example: { op: 'page.duplicate', page: 1, insertAt: 2 },
  },
  {
    op: 'page.move',
    category: 'page',
    summary: 'Move one page to another 1-based position.',
    required: ['page', 'destinationPage'],
    precondition: 'none',
    example: { op: 'page.move', page: 3, destinationPage: 1 },
  },
  {
    op: 'page.crop',
    category: 'page',
    summary: 'Set the visible crop box using top-left editor coordinates.',
    required: ['page', 'x', 'y', 'width', 'height'],
    precondition: 'none',
    example: { op: 'page.crop', page: 1, x: 18, y: 18, width: 559, height: 806 },
  },
  {
    op: 'document.merge',
    category: 'page',
    summary: 'Import all pages from another trusted PDF payload.',
    required: ['sourceBytesBase64'],
    precondition: 'none',
    example: { op: 'document.merge', insertAt: 2, sourceBytesBase64: '<trusted PDF bytes>' },
  },
  {
    op: 'metadata.set',
    category: 'document',
    summary: 'Set title, author, subject, keywords, creator, producer, and language metadata.',
    required: ['metadata'],
    precondition: 'none',
    example: { op: 'metadata.set', metadata: { title: '검토본', author: 'Academic Editor', language: 'ko-KR' } },
  },
  {
    op: 'document.flattenAll',
    category: 'document',
    summary: 'Flatten layers, form fields, and annotations into static page content.',
    required: [],
    precondition: 'none',
    example: { op: 'document.flattenAll' },
  },
  {
    op: 'attachment.add',
    category: 'attachment',
    summary: 'Embed a bounded file attachment in the PDF.',
    required: ['name', 'bytesBase64'],
    precondition: 'none',
    example: { op: 'attachment.add', name: 'evidence.txt', mimeType: 'text/plain', bytesBase64: '<trusted bytes>' },
  },
  {
    op: 'attachment.remove',
    category: 'attachment',
    summary: 'Remove an embedded file attachment by exact name.',
    required: ['name'],
    precondition: 'none',
    example: { op: 'attachment.remove', name: 'evidence.txt' },
  },
  {
    op: 'security.encrypt',
    category: 'security',
    summary: 'Encrypt saved output with AES-256 and explicit document permissions.',
    required: ['ownerPassword'],
    precondition: 'none',
    example: { op: 'security.encrypt', userPassword: 'reader-password', ownerPassword: 'owner-password', permissions: { print: true, copy: false } },
  },
  {
    op: 'security.remove',
    category: 'security',
    summary: 'Remove output encryption configured in the current editing session.',
    required: [],
    precondition: 'none',
    example: { op: 'security.remove' },
  },
]);

const PDF_COMMAND_CATEGORIES = Object.freeze([...new Set(PDF_COMMANDS.map((entry) => entry.category))]);
const PDF_COMMAND_OPS = Object.freeze(PDF_COMMANDS.map((entry) => entry.op));
const commandByOp = new Map(PDF_COMMANDS.map((entry) => [entry.op, entry]));

function finiteNumber(value, label, { minimum = -Infinity, maximum = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be a finite number between ${minimum} and ${maximum}.`);
  }
  return number;
}

function validateImageCommand(command) {
  if (!['image/png', 'image/jpeg'].includes(String(command.mimeType || '').toLowerCase())) {
    throw new Error(`${command.op}.mimeType must be image/png or image/jpeg.`);
  }
  if (typeof command.bytesBase64 !== 'string' || !command.bytesBase64.length || command.bytesBase64.length > 28_000_000) {
    throw new Error(`${command.op}.bytesBase64 must contain at most 28,000,000 base64 characters.`);
  }
}

function boundedBase64(value, label, maximum = 112_000_000) {
  if (typeof value !== 'string' || !value.length || value.length > maximum || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error(`${label} must contain valid bounded base64 data.`);
  }
  return value;
}

function boundedText(value, label, maximum = 1024, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && !value.length) || value.length > maximum || /[\0\\/]/.test(label.endsWith('.name') ? value : '')) {
    throw new Error(`${label} must be ${allowEmpty ? 'at most' : 'between 1 and'} ${maximum} characters.`);
  }
  return value;
}

function validatePdfCommands(commands) {
  if (!Array.isArray(commands) || commands.length === 0 || commands.length > 100) {
    throw new Error('PDF commands must contain 1-100 entries.');
  }
  return commands.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`commands[${index}] must be an object.`);
    }
    const command = { ...raw, op: String(raw.op || '') };
    const entry = commandByOp.get(command.op);
    if (!entry) throw new Error(`Unsupported PDF command: ${command.op || '(empty)'}.`);
    for (const field of entry.required) {
      const allowsEmptyText = command.op === 'text.replaceObject' && ['expectedText', 'text'].includes(field);
      if (command[field] === undefined || command[field] === null || (!allowsEmptyText && command[field] === '')) {
        throw new Error(`${command.op}.${field} is required.`);
      }
    }
    const objectOps = new Set(['text.replaceObject', 'image.replaceObject', 'object.transform', 'object.delete']);
    const pageOps = new Set(['text.add', 'text.replaceObject', 'highlight.add', 'ink.add', 'image.add', 'image.replaceObject', 'object.transform', 'object.delete', 'signature.addAppearance', 'page.rotate', 'page.delete', 'page.duplicate', 'page.move', 'page.crop']);
    if (pageOps.has(command.op)) {
      command.page = finiteNumber(command.page, `${command.op}.page`, { minimum: 1, maximum: 10000 });
      if (!Number.isInteger(command.page)) throw new Error(`${command.op}.page must be an integer.`);
    }
    if (command.op === 'text.add') {
      command.x = finiteNumber(command.x, 'text.add.x', { minimum: 0, maximum: 100000 });
      command.y = finiteNumber(command.y, 'text.add.y', { minimum: 0, maximum: 100000 });
      command.fontSize = finiteNumber(command.fontSize ?? 14, 'text.add.fontSize', { minimum: 4, maximum: 144 });
      if (command.fontFamily !== undefined) command.fontFamily = boundedText(command.fontFamily, 'text.add.fontFamily', 128);
      if (command.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(command.color))) throw new Error('text.add.color must be a six-digit hex color.');
      if (command.opacity !== undefined) command.opacity = finiteNumber(command.opacity, 'text.add.opacity', { minimum: 0, maximum: 1 });
      if (typeof command.text !== 'string' || !command.text.length || command.text.length > 5000) {
        throw new Error('text.add.text must contain 1-5000 characters.');
      }
    } else if (objectOps.has(command.op)) {
      command.objectIndex = finiteNumber(command.objectIndex, `${command.op}.objectIndex`, { minimum: 0, maximum: 100000 });
      if (!Number.isInteger(command.objectIndex)) throw new Error(`${command.op}.objectIndex must be an integer.`);
      command.objectId = boundedText(command.objectId, `${command.op}.objectId`, 256);
      if (command.op === 'text.replaceObject') {
        command.expectedText = boundedText(command.expectedText, 'text.replaceObject.expectedText', 10000, { allowEmpty: true });
        command.text = boundedText(command.text, 'text.replaceObject.text', 10000, { allowEmpty: true });
        if (command.fontFamily !== undefined) command.fontFamily = boundedText(command.fontFamily, 'text.replaceObject.fontFamily', 128);
        if (command.fontSize !== undefined) command.fontSize = finiteNumber(command.fontSize, 'text.replaceObject.fontSize', { minimum: 2, maximum: 500 });
        if (command.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(command.color))) throw new Error('text.replaceObject.color must be a six-digit hex color.');
        if (command.opacity !== undefined) command.opacity = finiteNumber(command.opacity, 'text.replaceObject.opacity', { minimum: 0, maximum: 1 });
      } else if (command.op === 'image.replaceObject') {
        validateImageCommand(command);
        command.mimeType = String(command.mimeType).toLowerCase();
      } else if (command.op === 'object.transform') {
        if (!command.matrix || typeof command.matrix !== 'object' || Array.isArray(command.matrix)) throw new Error('object.transform.matrix must be an object.');
        command.matrix = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((key) => [
          key,
          finiteNumber(command.matrix[key], `object.transform.matrix.${key}`, { minimum: -1000000, maximum: 1000000 }),
        ]));
      }
    } else if (command.op === 'ink.add') {
      if (!Array.isArray(command.points) || command.points.length < 2 || command.points.length > 5000) {
        throw new Error('ink.add.points must contain 2-5000 points.');
      }
      command.points = command.points.map((point, pointIndex) => ({
        x: finiteNumber(point?.x, `ink.add.points[${pointIndex}].x`, { minimum: 0, maximum: 100000 }),
        y: finiteNumber(point?.y, `ink.add.points[${pointIndex}].y`, { minimum: 0, maximum: 100000 }),
      }));
      command.thickness = finiteNumber(command.thickness ?? 2, 'ink.add.thickness', { minimum: 0.25, maximum: 40 });
    } else if (command.op === 'page.rotate') {
      command.degrees = finiteNumber(command.degrees, 'page.rotate.degrees', { minimum: -360, maximum: 360 });
      if (command.degrees % 90 !== 0) throw new Error('page.rotate.degrees must be a multiple of 90.');
    } else if (command.op === 'page.add') {
      command.insertAt = finiteNumber(command.insertAt ?? 10000, 'page.add.insertAt', { minimum: 1, maximum: 10000 });
      if (!Number.isInteger(command.insertAt)) throw new Error('page.add.insertAt must be an integer.');
      command.size = String(command.size || 'a4').toLowerCase();
      if (!['a4', 'letter', 'legal', 'custom'].includes(command.size)) throw new Error('page.add.size must be a4, letter, legal, or custom.');
      command.orientation = String(command.orientation || 'portrait').toLowerCase();
      if (!['portrait', 'landscape'].includes(command.orientation)) throw new Error('page.add.orientation must be portrait or landscape.');
      if (command.size === 'custom') {
        command.width = finiteNumber(command.width, 'page.add.width', { minimum: 36, maximum: 14400 });
        command.height = finiteNumber(command.height, 'page.add.height', { minimum: 36, maximum: 14400 });
      }
    } else if (command.op === 'page.delete') {
      // The current page count is checked transactionally by the runtime.
    } else if (command.op === 'page.duplicate') {
      command.insertAt = finiteNumber(command.insertAt ?? command.page + 1, 'page.duplicate.insertAt', { minimum: 1, maximum: 10000 });
      if (!Number.isInteger(command.insertAt)) throw new Error('page.duplicate.insertAt must be an integer.');
    } else if (command.op === 'page.move') {
      command.destinationPage = finiteNumber(command.destinationPage, 'page.move.destinationPage', { minimum: 1, maximum: 10000 });
      if (!Number.isInteger(command.destinationPage)) throw new Error('page.move.destinationPage must be an integer.');
    } else if (command.op === 'document.merge') {
      command.sourceBytesBase64 = boundedBase64(command.sourceBytesBase64, 'document.merge.sourceBytesBase64');
      command.insertAt = finiteNumber(command.insertAt ?? 10000, 'document.merge.insertAt', { minimum: 1, maximum: 10000 });
      if (!Number.isInteger(command.insertAt)) throw new Error('document.merge.insertAt must be an integer.');
    } else if (command.op === 'metadata.set') {
      if (!command.metadata || typeof command.metadata !== 'object' || Array.isArray(command.metadata)) throw new Error('metadata.set.metadata must be an object.');
      const allowed = new Set(['title', 'author', 'subject', 'keywords', 'creator', 'producer', 'language']);
      for (const key of Object.keys(command.metadata)) if (!allowed.has(key)) throw new Error(`metadata.set.metadata.${key} is not supported.`);
      command.metadata = { ...command.metadata };
      for (const key of ['title', 'author', 'subject', 'creator', 'producer', 'language']) {
        if (command.metadata[key] !== undefined) command.metadata[key] = boundedText(command.metadata[key], `metadata.set.metadata.${key}`, 2048, { allowEmpty: true });
      }
      if (command.metadata.keywords !== undefined) {
        if (!Array.isArray(command.metadata.keywords) || command.metadata.keywords.length > 100) throw new Error('metadata.set.metadata.keywords must contain at most 100 strings.');
        command.metadata.keywords = command.metadata.keywords.map((value, keywordIndex) => boundedText(value, `metadata.set.metadata.keywords[${keywordIndex}]`, 256));
      }
    } else if (command.op === 'document.flattenAll' || command.op === 'security.remove') {
      // No additional fields.
    } else if (command.op === 'signature.addDigital') {
      command.p12BytesBase64 = boundedBase64(command.p12BytesBase64, 'signature.addDigital.p12BytesBase64', 14_000_000);
      command.password = boundedText(String(command.password || ''), 'signature.addDigital.password', 1024, { allowEmpty: true });
      for (const key of ['reason', 'location', 'contactInfo', 'fieldName']) {
        if (command[key] !== undefined) command[key] = boundedText(command[key], `signature.addDigital.${key}`, 1024, { allowEmpty: true });
      }
    } else if (command.op === 'attachment.add') {
      command.name = boundedText(command.name, 'attachment.add.name', 255);
      command.bytesBase64 = boundedBase64(command.bytesBase64, 'attachment.add.bytesBase64', 28_000_000);
      command.mimeType = boundedText(String(command.mimeType || 'application/octet-stream'), 'attachment.add.mimeType', 255);
    } else if (command.op === 'attachment.remove') {
      command.name = boundedText(command.name, 'attachment.remove.name', 255);
    } else if (command.op === 'security.encrypt') {
      command.userPassword = boundedText(String(command.userPassword || ''), 'security.encrypt.userPassword', 127, { allowEmpty: true });
      command.ownerPassword = boundedText(command.ownerPassword, 'security.encrypt.ownerPassword', 127);
      if (command.userPassword === command.ownerPassword) throw new Error('security.encrypt ownerPassword must differ from userPassword.');
      if (command.permissions !== undefined && (!command.permissions || typeof command.permissions !== 'object' || Array.isArray(command.permissions))) {
        throw new Error('security.encrypt.permissions must be an object.');
      }
      const permissionKeys = new Set(['print', 'printHighQuality', 'modify', 'copy', 'annotate', 'fillForms', 'accessibility', 'assemble']);
      for (const [key, value] of Object.entries(command.permissions || {})) {
        if (!permissionKeys.has(key) || typeof value !== 'boolean') throw new Error(`security.encrypt.permissions.${key} must be a supported boolean permission.`);
      }
    } else {
      for (const field of ['x', 'y', 'width', 'height']) {
        command[field] = finiteNumber(command[field], `${command.op}.${field}`, { minimum: 0, maximum: 100000 });
      }
      if (command.width <= 0 || command.height <= 0) throw new Error(`${command.op} width and height must be positive.`);
      if (command.op === 'highlight.add') {
        command.opacity = finiteNumber(command.opacity ?? 0.42, 'highlight.add.opacity', { minimum: 0.05, maximum: 0.9 });
      } else if (command.op !== 'page.crop') {
        validateImageCommand(command);
      }
    }
    return { command, entry };
  });
}

function getPdfCommandCatalog(filters = {}) {
  const category = filters.category ? String(filters.category) : '';
  const op = filters.op ? String(filters.op) : '';
  const commands = PDF_COMMANDS.filter((entry) => (!category || entry.category === category) && (!op || entry.op === op));
  return { format: 'pdf', commandCount: commands.length, categories: PDF_COMMAND_CATEGORIES, commands };
}

function commandsNeedPrecondition(entries = [], precondition) {
  return entries.some((value) => value.entry?.precondition === precondition);
}

function requiredInspectionTargets(commands = []) {
  return commands
    .filter((command) => ['text.replaceObject', 'image.replaceObject', 'object.transform', 'object.delete'].includes(command.op))
    .map((command) => ({
      op: command.op,
      role: 'target',
      key: stablePdfTargetKey({ page: command.page, objectId: command.objectId }),
      location: { page: command.page, objectId: command.objectId, objectIndex: command.objectIndex },
    }));
}

function stablePdfTargetKey(location = {}) {
  const page = Number(location.page ?? location.paragraph?.section + 1);
  const objectId = String(location.objectId ?? location.paragraph?.number ?? 'page');
  return Number.isInteger(page) && page > 0 ? `pdf:p${page}:${objectId}` : '';
}

export {
  PDF_COMMAND_CATEGORIES,
  PDF_COMMAND_OPS,
  commandsNeedPrecondition,
  getPdfCommandCatalog,
  requiredInspectionTargets,
  stablePdfTargetKey,
  validatePdfCommands,
};
