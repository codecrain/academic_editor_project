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
    op: 'ocr.recognize',
    category: 'ocr',
    summary: 'Recognize scanned Korean and English pages locally and add an invisible searchable text layer.',
    required: [],
    precondition: 'none',
    example: { op: 'ocr.recognize', pages: [1, 2], languages: ['kor', 'eng'], dpi: 180, minimumConfidence: 35, force: false },
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
    op: 'text.replaceAll',
    category: 'text',
    summary: 'Replace matching text across inspected PDF text objects with optional page, case, and open-font controls.',
    required: ['find', 'replace'],
    precondition: 'none',
    example: { op: 'text.replaceAll', find: 'Draft', replace: 'Final', pages: [1, 2], caseSensitive: true, fontFamily: 'Noto Sans KR' },
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
    op: 'comment.add',
    category: 'annotation',
    summary: 'Add a persistent PDF text-note comment with author, icon, and color.',
    required: ['page', 'x', 'y', 'text'],
    precondition: 'none',
    example: { op: 'comment.add', page: 1, x: 72, y: 160, text: '검토가 필요합니다.', author: 'Reviewer', icon: 'Comment', color: '#ffd166' },
  },
  {
    op: 'textMarkup.add',
    category: 'annotation',
    summary: 'Add a standards-based highlight, underline, squiggly, or strikeout annotation.',
    required: ['page', 'x', 'y', 'width', 'height', 'style'],
    precondition: 'none',
    example: { op: 'textMarkup.add', page: 1, x: 72, y: 120, width: 180, height: 18, style: 'underline', color: '#f04438' },
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
    op: 'page.resize',
    category: 'page',
    summary: 'Resize a page and optionally scale and center its content and annotations.',
    required: ['page', 'width', 'height'],
    precondition: 'none',
    example: { op: 'page.resize', page: 1, width: 595.28, height: 841.89, scaleContent: true, preserveAspectRatio: true, centerContent: true },
  },
  {
    op: 'page.setLabels',
    category: 'page',
    summary: 'Set PDF page-label number-tree segments using decimal, Roman, alphabetic, or prefix-only labels.',
    required: ['segments'],
    precondition: 'none',
    example: { op: 'page.setLabels', segments: [{ page: 1, style: 'roman-lower', prefix: '', start: 1 }, { page: 3, style: 'decimal', prefix: 'A-', start: 1 }] },
  },
  {
    op: 'page.extract',
    category: 'page',
    summary: 'Keep selected pages in the requested order and remove all other pages.',
    required: ['pages'],
    precondition: 'none',
    example: { op: 'page.extract', pages: [1, 3, 5] },
  },
  {
    op: 'page.replace',
    category: 'page',
    summary: 'Replace one page with a page copied from another trusted PDF.',
    required: ['page', 'sourceBytesBase64'],
    precondition: 'none',
    example: { op: 'page.replace', page: 2, sourcePage: 1, sourceBytesBase64: '<trusted PDF bytes>' },
  },
  {
    op: 'page.setBoxes',
    category: 'page',
    summary: 'Set MediaBox, CropBox, BleedBox, TrimBox, or ArtBox dimensions.',
    required: ['page', 'boxes'],
    precondition: 'none',
    example: { op: 'page.setBoxes', page: 1, boxes: { media: { x: 0, y: 0, width: 595.28, height: 841.89 } } },
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
    op: 'document.setInitialView',
    category: 'document',
    summary: 'Set the initial navigation panel and viewer preferences such as title display, centering, and print scaling.',
    required: [],
    precondition: 'none',
    example: { op: 'document.setInitialView', pageMode: 'outlines', displayDocTitle: true, fitWindow: true, centerWindow: true, printScaling: 'none' },
  },
  {
    op: 'redaction.apply',
    category: 'redaction',
    summary: 'Permanently remove every page object intersecting a region and cover the region with an opaque fill.',
    required: ['page', 'regions'],
    precondition: 'none',
    example: { op: 'redaction.apply', page: 1, regions: [{ x: 72, y: 120, width: 180, height: 24 }], color: '#000000' },
  },
  {
    op: 'watermark.add',
    category: 'document',
    summary: 'Add rotated, translucent text across selected pages with an approved embedded font.',
    required: ['text'],
    precondition: 'none',
    example: { op: 'watermark.add', text: 'CONFIDENTIAL', pages: [1, 2], rotation: -35, opacity: 0.18, fontSize: 54 },
  },
  {
    op: 'background.set',
    category: 'document',
    summary: 'Paint a solid background behind the existing content of selected pages.',
    required: ['color'],
    precondition: 'none',
    example: { op: 'background.set', pages: [1], color: '#fff9e6', opacity: 1 },
  },
  {
    op: 'headerFooter.add',
    category: 'document',
    summary: 'Add configurable headers and footers with page-number placeholders.',
    required: [],
    precondition: 'none',
    example: { op: 'headerFooter.add', headerCenter: 'Academic Editor', footerRight: '{page} / {pages}', fontSize: 9 },
  },
  {
    op: 'bates.add',
    category: 'document',
    summary: 'Add zero-padded Bates identifiers to selected pages.',
    required: [],
    precondition: 'none',
    example: { op: 'bates.add', prefix: 'CASE-', start: 1, digits: 6, position: 'bottom-right' },
  },
  {
    op: 'link.add',
    category: 'interactive',
    summary: 'Add an external HTTPS link annotation to a rectangular page region.',
    required: ['page', 'x', 'y', 'width', 'height', 'url'],
    precondition: 'none',
    example: { op: 'link.add', page: 1, x: 72, y: 120, width: 160, height: 18, url: 'https://example.org' },
  },
  {
    op: 'bookmark.add',
    category: 'interactive',
    summary: 'Add a top-level outline bookmark that opens a page.',
    required: ['title', 'page'],
    precondition: 'none',
    example: { op: 'bookmark.add', title: 'Methods', page: 3 },
  },
  {
    op: 'form.addTextField',
    category: 'form',
    summary: 'Add an editable AcroForm text field.',
    required: ['name', 'page', 'x', 'y', 'width', 'height'],
    precondition: 'none',
    example: { op: 'form.addTextField', name: 'reviewer.name', page: 1, x: 72, y: 640, width: 180, height: 24 },
  },
  {
    op: 'form.addCheckBox',
    category: 'form',
    summary: 'Add an AcroForm checkbox.',
    required: ['name', 'page', 'x', 'y', 'width', 'height'],
    precondition: 'none',
    example: { op: 'form.addCheckBox', name: 'approved', page: 1, x: 72, y: 680, width: 18, height: 18 },
  },
  {
    op: 'form.addDropdown',
    category: 'form',
    summary: 'Add an AcroForm dropdown with explicit options.',
    required: ['name', 'page', 'x', 'y', 'width', 'height', 'options'],
    precondition: 'none',
    example: { op: 'form.addDropdown', name: 'decision', page: 1, x: 72, y: 710, width: 140, height: 24, options: ['Approve', 'Reject'] },
  },
  {
    op: 'form.remove',
    category: 'form',
    summary: 'Remove an AcroForm field by exact fully-qualified name.',
    required: ['name'],
    precondition: 'none',
    example: { op: 'form.remove', name: 'reviewer.name' },
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
    op: 'document.sanitize',
    category: 'security',
    summary: 'Remove metadata, attachments, JavaScript, open actions, launch actions, and embedded form submissions.',
    required: [],
    precondition: 'none',
    example: { op: 'document.sanitize' },
  },
  {
    op: 'document.optimize',
    category: 'document',
    summary: 'Rewrite the PDF with object streams and compressed streams while preserving visual content.',
    required: [],
    precondition: 'none',
    example: { op: 'document.optimize' },
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

function boundedPageList(value, label = 'pages') {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > 10000) {
    throw new Error(`${label} must contain 1-10000 page numbers.`);
  }
  const pages = value.map((page, index) => {
    const number = finiteNumber(page, `${label}[${index}]`, { minimum: 1, maximum: 10000 });
    if (!Number.isInteger(number)) throw new Error(`${label}[${index}] must be an integer.`);
    return number;
  });
  if (new Set(pages).size !== pages.length) throw new Error(`${label} must not contain duplicate page numbers.`);
  return pages;
}

function boundedRectangle(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a rectangle object.`);
  const rectangle = Object.fromEntries(['x', 'y', 'width', 'height'].map((key) => [
    key,
    finiteNumber(value[key], `${label}.${key}`, { minimum: 0, maximum: 100000 }),
  ]));
  if (rectangle.width <= 0 || rectangle.height <= 0) throw new Error(`${label} width and height must be positive.`);
  return rectangle;
}

function boundedColor(value, label, fallback) {
  const color = String(value ?? fallback ?? '');
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`${label} must be a six-digit hex color.`);
  return color.toLowerCase();
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
    const pageOps = new Set([
      'text.add', 'text.replaceObject', 'highlight.add', 'ink.add', 'image.add', 'image.replaceObject',
      'object.transform', 'object.delete', 'signature.addAppearance', 'page.rotate', 'page.delete',
      'page.duplicate', 'page.move', 'page.crop', 'page.replace', 'page.setBoxes', 'redaction.apply',
      'link.add', 'bookmark.add', 'form.addTextField', 'form.addCheckBox', 'form.addDropdown',
      'comment.add', 'textMarkup.add', 'page.resize',
    ]);
    if (pageOps.has(command.op)) {
      command.page = finiteNumber(command.page, `${command.op}.page`, { minimum: 1, maximum: 10000 });
      if (!Number.isInteger(command.page)) throw new Error(`${command.op}.page must be an integer.`);
    }
    if (command.op === 'text.add') {
      command.x = finiteNumber(command.x, 'text.add.x', { minimum: 0, maximum: 100000 });
      command.y = finiteNumber(command.y, 'text.add.y', { minimum: 0, maximum: 100000 });
      command.fontSize = finiteNumber(command.fontSize ?? 14, 'text.add.fontSize', { minimum: 4, maximum: 144 });
      command.rotation = finiteNumber(command.rotation ?? 0, 'text.add.rotation', { minimum: -360, maximum: 360 });
      if (command.fontFamily !== undefined) command.fontFamily = boundedText(command.fontFamily, 'text.add.fontFamily', 128);
      if (command.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(command.color))) throw new Error('text.add.color must be a six-digit hex color.');
      if (command.opacity !== undefined) command.opacity = finiteNumber(command.opacity, 'text.add.opacity', { minimum: 0, maximum: 1 });
      command.renderMode = String(command.renderMode || 'fill');
      if (!['fill', 'invisible'].includes(command.renderMode)) throw new Error('text.add.renderMode must be fill or invisible.');
      if (typeof command.text !== 'string' || !command.text.length || command.text.length > 5000) {
        throw new Error('text.add.text must contain 1-5000 characters.');
      }
    } else if (command.op === 'ocr.recognize') {
      command.pages = boundedPageList(command.pages, 'ocr.recognize.pages');
      command.languages = command.languages === undefined ? ['kor', 'eng'] : command.languages;
      if (!Array.isArray(command.languages) || command.languages.length < 1 || command.languages.length > 2) {
        throw new Error('ocr.recognize.languages must contain kor, eng, or both.');
      }
      command.languages = [...new Set(command.languages.map((language) => String(language).toLowerCase()))];
      if (command.languages.some((language) => !['kor', 'eng'].includes(language))) {
        throw new Error('ocr.recognize.languages supports only kor and eng.');
      }
      command.dpi = finiteNumber(command.dpi ?? 180, 'ocr.recognize.dpi', { minimum: 120, maximum: 240 });
      command.minimumConfidence = finiteNumber(command.minimumConfidence ?? 35, 'ocr.recognize.minimumConfidence', { minimum: 0, maximum: 100 });
      command.force = Boolean(command.force);
      command.minimumExistingTextCharacters = finiteNumber(
        command.minimumExistingTextCharacters ?? 10,
        'ocr.recognize.minimumExistingTextCharacters',
        { minimum: 1, maximum: 1000 },
      );
    } else if (command.op === 'text.replaceAll') {
      command.find = boundedText(command.find, 'text.replaceAll.find', 5000);
      command.replace = boundedText(command.replace, 'text.replaceAll.replace', 5000, { allowEmpty: true });
      command.pages = boundedPageList(command.pages, 'text.replaceAll.pages');
      command.caseSensitive = command.caseSensitive === undefined ? true : Boolean(command.caseSensitive);
      if (command.fontFamily !== undefined && command.fontFamily !== '') {
        command.fontFamily = boundedText(command.fontFamily, 'text.replaceAll.fontFamily', 128);
      } else {
        delete command.fontFamily;
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
    } else if (command.op === 'comment.add') {
      command.x = finiteNumber(command.x, 'comment.add.x', { minimum: 0, maximum: 100000 });
      command.y = finiteNumber(command.y, 'comment.add.y', { minimum: 0, maximum: 100000 });
      command.width = finiteNumber(command.width ?? 24, 'comment.add.width', { minimum: 8, maximum: 500 });
      command.height = finiteNumber(command.height ?? 24, 'comment.add.height', { minimum: 8, maximum: 500 });
      command.text = boundedText(command.text, 'comment.add.text', 10000);
      command.author = boundedText(String(command.author || 'Reviewer'), 'comment.add.author', 256);
      command.icon = String(command.icon || 'Comment');
      if (!['Comment', 'Key', 'Note', 'Help', 'NewParagraph', 'Paragraph', 'Insert'].includes(command.icon)) {
        throw new Error('comment.add.icon is not supported.');
      }
      command.color = boundedColor(command.color, 'comment.add.color', '#ffd166');
      command.open = Boolean(command.open);
    } else if (command.op === 'textMarkup.add') {
      Object.assign(command, boundedRectangle(command, 'textMarkup.add'));
      command.style = String(command.style).toLowerCase();
      if (!['highlight', 'underline', 'squiggly', 'strikeout'].includes(command.style)) {
        throw new Error('textMarkup.add.style must be highlight, underline, squiggly, or strikeout.');
      }
      command.color = boundedColor(command.color, 'textMarkup.add.color', command.style === 'highlight' ? '#ffe066' : '#f04438');
      if (command.text !== undefined) command.text = boundedText(command.text, 'textMarkup.add.text', 10000, { allowEmpty: true });
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
    } else if (command.op === 'page.resize') {
      command.width = finiteNumber(command.width, 'page.resize.width', { minimum: 36, maximum: 14400 });
      command.height = finiteNumber(command.height, 'page.resize.height', { minimum: 36, maximum: 14400 });
      command.scaleContent = command.scaleContent === undefined ? true : Boolean(command.scaleContent);
      command.preserveAspectRatio = command.preserveAspectRatio === undefined ? true : Boolean(command.preserveAspectRatio);
      command.centerContent = command.centerContent === undefined ? true : Boolean(command.centerContent);
    } else if (command.op === 'page.setLabels') {
      if (!Array.isArray(command.segments) || command.segments.length < 1 || command.segments.length > 1000) {
        throw new Error('page.setLabels.segments must contain 1-1000 label segments.');
      }
      command.segments = command.segments.map((segment, segmentIndex) => {
        const page = finiteNumber(segment?.page, `page.setLabels.segments[${segmentIndex}].page`, { minimum: 1, maximum: 10000 });
        const start = finiteNumber(segment?.start ?? 1, `page.setLabels.segments[${segmentIndex}].start`, { minimum: 1, maximum: 1000000000 });
        if (!Number.isInteger(page) || !Number.isInteger(start)) throw new Error('page.setLabels segment page and start must be integers.');
        const style = String(segment?.style || 'decimal').toLowerCase();
        if (!['decimal', 'roman-upper', 'roman-lower', 'letters-upper', 'letters-lower', 'prefix-only'].includes(style)) {
          throw new Error(`page.setLabels.segments[${segmentIndex}].style is not supported.`);
        }
        return {
          page,
          start,
          style,
          prefix: boundedText(String(segment?.prefix || ''), `page.setLabels.segments[${segmentIndex}].prefix`, 128, { allowEmpty: true }),
        };
      });
      const segmentPages = command.segments.map((segment) => segment.page);
      if (new Set(segmentPages).size !== segmentPages.length) throw new Error('page.setLabels segment pages must be unique.');
      command.segments.sort((left, right) => left.page - right.page);
    } else if (command.op === 'page.extract') {
      command.pages = boundedPageList(command.pages, 'page.extract.pages');
    } else if (command.op === 'page.replace') {
      command.sourceBytesBase64 = boundedBase64(command.sourceBytesBase64, 'page.replace.sourceBytesBase64');
      command.sourcePage = finiteNumber(command.sourcePage ?? 1, 'page.replace.sourcePage', { minimum: 1, maximum: 10000 });
      if (!Number.isInteger(command.sourcePage)) throw new Error('page.replace.sourcePage must be an integer.');
    } else if (command.op === 'page.setBoxes') {
      if (!command.boxes || typeof command.boxes !== 'object' || Array.isArray(command.boxes)) throw new Error('page.setBoxes.boxes must be an object.');
      const allowedBoxes = new Set(['media', 'crop', 'bleed', 'trim', 'art']);
      command.boxes = Object.fromEntries(Object.entries(command.boxes).map(([key, value]) => {
        if (!allowedBoxes.has(key)) throw new Error(`page.setBoxes.boxes.${key} is not supported.`);
        return [key, boundedRectangle(value, `page.setBoxes.boxes.${key}`)];
      }));
      if (!Object.keys(command.boxes).length) throw new Error('page.setBoxes.boxes must contain at least one page box.');
    } else if (command.op === 'document.merge') {
      command.sourceBytesBase64 = boundedBase64(command.sourceBytesBase64, 'document.merge.sourceBytesBase64');
      command.insertAt = finiteNumber(command.insertAt ?? 10000, 'document.merge.insertAt', { minimum: 1, maximum: 10000 });
      if (!Number.isInteger(command.insertAt)) throw new Error('document.merge.insertAt must be an integer.');
    } else if (command.op === 'document.setInitialView') {
      command.pageMode = String(command.pageMode || 'none').toLowerCase();
      if (!['none', 'outlines', 'thumbnails', 'fullscreen', 'attachments'].includes(command.pageMode)) {
        throw new Error('document.setInitialView.pageMode is not supported.');
      }
      for (const key of ['hideToolbar', 'hideMenubar', 'hideWindowUI', 'fitWindow', 'centerWindow', 'displayDocTitle']) {
        command[key] = Boolean(command[key]);
      }
      command.readingDirection = String(command.readingDirection || 'left-to-right').toLowerCase();
      if (!['left-to-right', 'right-to-left'].includes(command.readingDirection)) {
        throw new Error('document.setInitialView.readingDirection is not supported.');
      }
      command.printScaling = String(command.printScaling || 'app-default').toLowerCase();
      if (!['app-default', 'none'].includes(command.printScaling)) {
        throw new Error('document.setInitialView.printScaling is not supported.');
      }
    } else if (command.op === 'redaction.apply') {
      if (!Array.isArray(command.regions) || command.regions.length < 1 || command.regions.length > 1000) {
        throw new Error('redaction.apply.regions must contain 1-1000 rectangles.');
      }
      command.regions = command.regions.map((region, regionIndex) => boundedRectangle(region, `redaction.apply.regions[${regionIndex}]`));
      command.color = boundedColor(command.color, 'redaction.apply.color', '#000000');
      if (command.overlayText !== undefined) command.overlayText = boundedText(command.overlayText, 'redaction.apply.overlayText', 200, { allowEmpty: true });
    } else if (['watermark.add', 'background.set', 'headerFooter.add', 'bates.add'].includes(command.op)) {
      command.pages = boundedPageList(command.pages, `${command.op}.pages`);
      if (command.op === 'watermark.add') {
        command.text = boundedText(command.text, 'watermark.add.text', 1000);
        command.fontFamily = boundedText(String(command.fontFamily || 'Noto Sans KR'), 'watermark.add.fontFamily', 128);
        command.fontSize = finiteNumber(command.fontSize ?? 54, 'watermark.add.fontSize', { minimum: 4, maximum: 500 });
        command.rotation = finiteNumber(command.rotation ?? -35, 'watermark.add.rotation', { minimum: -360, maximum: 360 });
        command.opacity = finiteNumber(command.opacity ?? 0.18, 'watermark.add.opacity', { minimum: 0.01, maximum: 1 });
        command.color = boundedColor(command.color, 'watermark.add.color', '#667085');
      } else if (command.op === 'background.set') {
        command.color = boundedColor(command.color, 'background.set.color');
        command.opacity = finiteNumber(command.opacity ?? 1, 'background.set.opacity', { minimum: 1, maximum: 1 });
      } else if (command.op === 'headerFooter.add') {
        for (const key of ['headerLeft', 'headerCenter', 'headerRight', 'footerLeft', 'footerCenter', 'footerRight']) {
          command[key] = boundedText(String(command[key] || ''), `headerFooter.add.${key}`, 1000, { allowEmpty: true });
        }
        if (!['headerLeft', 'headerCenter', 'headerRight', 'footerLeft', 'footerCenter', 'footerRight'].some((key) => command[key])) {
          throw new Error('headerFooter.add requires at least one non-empty header or footer value.');
        }
        command.fontFamily = boundedText(String(command.fontFamily || 'Noto Sans KR'), 'headerFooter.add.fontFamily', 128);
        command.fontSize = finiteNumber(command.fontSize ?? 9, 'headerFooter.add.fontSize', { minimum: 4, maximum: 72 });
        command.margin = finiteNumber(command.margin ?? 24, 'headerFooter.add.margin', { minimum: 0, maximum: 720 });
        command.color = boundedColor(command.color, 'headerFooter.add.color', '#475467');
      } else {
        command.prefix = boundedText(String(command.prefix || ''), 'bates.add.prefix', 128, { allowEmpty: true });
        command.suffix = boundedText(String(command.suffix || ''), 'bates.add.suffix', 128, { allowEmpty: true });
        command.start = finiteNumber(command.start ?? 1, 'bates.add.start', { minimum: 0, maximum: 999999999999 });
        command.digits = finiteNumber(command.digits ?? 6, 'bates.add.digits', { minimum: 1, maximum: 12 });
        if (!Number.isInteger(command.start) || !Number.isInteger(command.digits)) throw new Error('bates.add start and digits must be integers.');
        command.position = String(command.position || 'bottom-right');
        if (!['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'].includes(command.position)) {
          throw new Error('bates.add.position is not supported.');
        }
        command.fontFamily = boundedText(String(command.fontFamily || 'Noto Sans KR'), 'bates.add.fontFamily', 128);
        command.fontSize = finiteNumber(command.fontSize ?? 9, 'bates.add.fontSize', { minimum: 4, maximum: 72 });
        command.margin = finiteNumber(command.margin ?? 24, 'bates.add.margin', { minimum: 0, maximum: 720 });
        command.color = boundedColor(command.color, 'bates.add.color', '#172033');
      }
    } else if (command.op === 'link.add') {
      Object.assign(command, boundedRectangle(command, 'link.add'));
      command.url = boundedText(command.url, 'link.add.url', 4096);
      let parsed;
      try { parsed = new URL(command.url); } catch { throw new Error('link.add.url must be a valid absolute URL.'); }
      if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) throw new Error('link.add.url must use https, http, or mailto.');
    } else if (command.op === 'bookmark.add') {
      command.title = boundedText(command.title, 'bookmark.add.title', 1024);
    } else if (['form.addTextField', 'form.addCheckBox', 'form.addDropdown'].includes(command.op)) {
      Object.assign(command, boundedRectangle(command, command.op));
      command.name = boundedText(command.name, `${command.op}.name`, 255);
      command.fontFamily = boundedText(String(command.fontFamily || 'Noto Sans KR'), `${command.op}.fontFamily`, 128);
      command.fontSize = finiteNumber(command.fontSize ?? 10, `${command.op}.fontSize`, { minimum: 4, maximum: 72 });
      if (command.op === 'form.addTextField') {
        command.value = boundedText(String(command.value || ''), 'form.addTextField.value', 10000, { allowEmpty: true });
        command.multiline = Boolean(command.multiline);
        command.required = Boolean(command.required);
      } else if (command.op === 'form.addCheckBox') {
        command.checked = Boolean(command.checked);
      } else {
        if (!Array.isArray(command.options) || command.options.length < 1 || command.options.length > 1000) {
          throw new Error('form.addDropdown.options must contain 1-1000 strings.');
        }
        command.options = command.options.map((value, optionIndex) => boundedText(value, `form.addDropdown.options[${optionIndex}]`, 1000));
        if (new Set(command.options).size !== command.options.length) throw new Error('form.addDropdown.options must be unique.');
        if (command.selected !== undefined && !command.options.includes(command.selected)) throw new Error('form.addDropdown.selected must match one option.');
      }
    } else if (command.op === 'form.remove') {
      command.name = boundedText(command.name, 'form.remove.name', 255);
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
    } else if (['document.flattenAll', 'document.sanitize', 'document.optimize', 'security.remove'].includes(command.op)) {
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
