const PDF_COMMANDS = Object.freeze([
  {
    op: 'text.add',
    category: 'text',
    summary: 'Add a positioned text overlay to one PDF page.',
    required: ['page', 'x', 'y', 'text'],
    precondition: 'none',
    example: { op: 'text.add', page: 1, x: 72, y: 96, text: 'Reviewed', fontSize: 14, color: '#172033' },
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
    op: 'signature.addAppearance',
    category: 'signature',
    summary: 'Add a visible handwritten signature appearance. This is not a certificate-backed digital signature.',
    required: ['page', 'x', 'y', 'width', 'height', 'bytesBase64', 'mimeType'],
    precondition: 'none',
    example: { op: 'signature.addAppearance', page: 1, x: 360, y: 650, width: 120, height: 48, mimeType: 'image/png', bytesBase64: '<trusted signature image bytes>' },
  },
  {
    op: 'page.rotate',
    category: 'page',
    summary: 'Rotate one page clockwise by a multiple of 90 degrees.',
    required: ['page', 'degrees'],
    precondition: 'none',
    example: { op: 'page.rotate', page: 1, degrees: 90 },
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
      if (command[field] === undefined || command[field] === null || command[field] === '') {
        throw new Error(`${command.op}.${field} is required.`);
      }
    }
    command.page = finiteNumber(command.page, `${command.op}.page`, { minimum: 1, maximum: 10000 });
    if (!Number.isInteger(command.page)) throw new Error(`${command.op}.page must be an integer.`);
    if (command.op === 'text.add') {
      command.x = finiteNumber(command.x, 'text.add.x', { minimum: 0, maximum: 100000 });
      command.y = finiteNumber(command.y, 'text.add.y', { minimum: 0, maximum: 100000 });
      command.fontSize = finiteNumber(command.fontSize ?? 14, 'text.add.fontSize', { minimum: 4, maximum: 144 });
      if (typeof command.text !== 'string' || !command.text.length || command.text.length > 5000) {
        throw new Error('text.add.text must contain 1-5000 characters.');
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
    } else {
      for (const field of ['x', 'y', 'width', 'height']) {
        command[field] = finiteNumber(command[field], `${command.op}.${field}`, { minimum: 0, maximum: 100000 });
      }
      if (command.width <= 0 || command.height <= 0) throw new Error(`${command.op} width and height must be positive.`);
      if (command.op === 'highlight.add') {
        command.opacity = finiteNumber(command.opacity ?? 0.42, 'highlight.add.opacity', { minimum: 0.05, maximum: 0.9 });
      } else {
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

function commandsNeedPrecondition() {
  return false;
}

function requiredInspectionTargets() {
  return [];
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
