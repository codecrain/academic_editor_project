const BOOLEAN = Object.freeze({ type: 'boolean' });
const STRING = Object.freeze({ type: 'string' });
const COLOR = Object.freeze({ type: 'color' });
const NUMBER = (minimum, maximum, integer = true) => Object.freeze({
  type: 'number', minimum, maximum, integer,
});
const ENUM = (...values) => Object.freeze({ type: 'enum', values: Object.freeze(values) });
const ARRAY = (length, minimum, maximum) => Object.freeze({
  type: 'array', length, minimum, maximum,
});

const COMMON_OBJECT_FIELDS = Object.freeze({
  width: NUMBER(1, 0xFFFF_FFFF),
  height: NUMBER(1, 0xFFFF_FFFF),
  treatAsChar: BOOLEAN,
  textWrap: ENUM('Square', 'Tight', 'Through', 'TopAndBottom', 'BehindText', 'InFrontOfText'),
  vertRelTo: ENUM('Paper', 'Page', 'Para'),
  vertAlign: ENUM('Top', 'Center', 'Bottom', 'Inside', 'Outside'),
  vertOffset: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
  horzRelTo: ENUM('Paper', 'Page', 'Column', 'Para'),
  horzAlign: ENUM('Left', 'Center', 'Right', 'Inside', 'Outside'),
  horzOffset: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
  allowOverlap: BOOLEAN,
  restrictInPage: BOOLEAN,
  keepWithAnchor: BOOLEAN,
  outerMarginLeft: NUMBER(-32768, 32767),
  outerMarginRight: NUMBER(-32768, 32767),
  outerMarginTop: NUMBER(-32768, 32767),
  outerMarginBottom: NUMBER(-32768, 32767),
});

const BORDER_FIELDS = Object.freeze({
  borderColor: NUMBER(0, 0xFFFF_FFFF),
  borderWidth: NUMBER(0, 0x7FFF_FFFF),
  borderAttr: NUMBER(0, 0xFFFF_FFFF),
});

const FORMAT_SCOPES = Object.freeze({
  character: Object.freeze({
    bold: BOOLEAN,
    italic: BOOLEAN,
    underline: BOOLEAN,
    strikethrough: BOOLEAN,
    fontSize: NUMBER(1, 0x7FFF_FFFF),
    fontId: NUMBER(0, 65535),
    textColor: COLOR,
    shadeColor: COLOR,
    underlineType: ENUM('None', 'Bottom', 'Top'),
    underlineColor: COLOR,
    outlineType: NUMBER(0, 255),
    shadowType: NUMBER(0, 255),
    shadowColor: COLOR,
    shadowOffsetX: NUMBER(-128, 127),
    shadowOffsetY: NUMBER(-128, 127),
    strikeColor: COLOR,
    subscript: BOOLEAN,
    superscript: BOOLEAN,
    emboss: BOOLEAN,
    engrave: BOOLEAN,
    emphasisDot: NUMBER(0, 255),
    underlineShape: NUMBER(0, 255),
    strikeShape: NUMBER(0, 255),
    kerning: BOOLEAN,
    fontIds: ARRAY(7, 0, 65535),
    ratios: ARRAY(7, 0, 255),
    spacings: ARRAY(7, -128, 127),
    relativeSizes: ARRAY(7, 0, 255),
    charOffsets: ARRAY(7, -128, 127),
    fontSizePt: NUMBER(0.01, 1000, false),
    color: COLOR,
    fontFamily: STRING,
  }),
  paragraph: Object.freeze({
    alignment: ENUM('left', 'right', 'center', 'justify', 'distribute'),
    lineSpacing: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    lineSpacingType: ENUM('Percent', 'Fixed', 'SpaceOnly', 'Minimum'),
    indent: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    marginLeft: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    marginRight: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    spacingBefore: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    spacingAfter: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    headType: ENUM('None', 'Outline', 'Number', 'Bullet'),
    paraLevel: NUMBER(0, 6),
    numberingId: NUMBER(0, 65535),
    widowOrphan: BOOLEAN,
    keepWithNext: BOOLEAN,
    keepLines: BOOLEAN,
    pageBreakBefore: BOOLEAN,
    fontLineHeight: BOOLEAN,
    singleLine: BOOLEAN,
    autoSpaceKrEn: BOOLEAN,
    autoSpaceKrNum: BOOLEAN,
    verticalAlign: NUMBER(0, 255),
    englishBreakUnit: NUMBER(0, 255),
    koreanBreakUnit: NUMBER(0, 255),
    borderSpacing: ARRAY(4, -32768, 32767),
    align: ENUM('left', 'right', 'center', 'justify', 'distribute'),
    margins: Object.freeze({ type: 'object' }),
  }),
  cell: Object.freeze({
    width: NUMBER(1, 0xFFFF_FFFF),
    height: NUMBER(1, 0xFFFF_FFFF),
    paddingLeft: NUMBER(-32768, 32767),
    paddingRight: NUMBER(-32768, 32767),
    paddingTop: NUMBER(-32768, 32767),
    paddingBottom: NUMBER(-32768, 32767),
    verticalAlign: ENUM('top', 'center', 'bottom', 0, 1, 2),
    textDirection: NUMBER(0, 255),
    isHeader: BOOLEAN,
    cellProtect: BOOLEAN,
    borderLeft: Object.freeze({ type: 'object' }),
    borderRight: Object.freeze({ type: 'object' }),
    borderTop: Object.freeze({ type: 'object' }),
    borderBottom: Object.freeze({ type: 'object' }),
    fillType: NUMBER(0, 255),
    fillColor: NUMBER(0, 0xFFFF_FFFF),
    patternColor: NUMBER(0, 0xFFFF_FFFF),
    patternType: NUMBER(0, 255),
  }),
  table: Object.freeze({
    ...Object.fromEntries(Object.entries(COMMON_OBJECT_FIELDS).filter(([field]) => ![
      'width', 'height',
      'outerMarginLeft', 'outerMarginRight', 'outerMarginTop', 'outerMarginBottom',
    ].includes(field))),
    outerLeft: NUMBER(-32768, 32767),
    outerRight: NUMBER(-32768, 32767),
    outerTop: NUMBER(-32768, 32767),
    outerBottom: NUMBER(-32768, 32767),
    cellSpacing: NUMBER(0, 65535),
    paddingLeft: NUMBER(-32768, 32767),
    paddingRight: NUMBER(-32768, 32767),
    paddingTop: NUMBER(-32768, 32767),
    paddingBottom: NUMBER(-32768, 32767),
    pageBreak: ENUM('None', 'CellBreak', 'RowBreak', 0, 1, 2),
    repeatHeader: BOOLEAN,
    captionDirection: ENUM('Left', 'Right', 'Top', 'Bottom', 0, 1, 2, 3),
    captionVertAlign: ENUM('Top', 'Center', 'Bottom', 0, 1, 2),
    captionWidth: NUMBER(0, 0xFFFF_FFFF),
    captionSpacing: NUMBER(-32768, 32767),
  }),
  image: Object.freeze({
    ...COMMON_OBJECT_FIELDS,
    cropLeft: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    cropTop: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    cropRight: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    cropBottom: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    paddingLeft: NUMBER(-32768, 32767),
    paddingRight: NUMBER(-32768, 32767),
    paddingTop: NUMBER(-32768, 32767),
    paddingBottom: NUMBER(-32768, 32767),
    ...BORDER_FIELDS,
  }),
  shape: Object.freeze({
    ...COMMON_OBJECT_FIELDS,
    ...BORDER_FIELDS,
    borderOutlineStyle: NUMBER(0, 255),
    lineType: NUMBER(0, 63),
    lineEndShape: NUMBER(0, 15),
    arrowStart: NUMBER(0, 63),
    arrowEnd: NUMBER(0, 63),
    arrowStartSize: NUMBER(0, 15),
    arrowEndSize: NUMBER(0, 15),
    rotationAngle: NUMBER(-32768, 32767),
    horzFlip: BOOLEAN,
    vertFlip: BOOLEAN,
    fillType: ENUM('none', 'solid', 'gradient', 'image'),
    fillBgColor: NUMBER(0, 0xFFFF_FFFF),
    fillPatColor: NUMBER(0, 0xFFFF_FFFF),
    fillPatType: NUMBER(0, 255),
    gradientType: NUMBER(0, 255),
    gradientAngle: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    gradientCenterX: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    gradientCenterY: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    gradientBlur: NUMBER(0, 255),
    fillAlpha: NUMBER(0, 255),
    shadowType: NUMBER(0, 255),
    shadowColor: NUMBER(0, 0xFFFF_FFFF),
    shadowOffsetX: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    shadowOffsetY: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    shadowAlpha: NUMBER(0, 255),
    tbMarginLeft: NUMBER(-32768, 32767),
    tbMarginRight: NUMBER(-32768, 32767),
    tbMarginTop: NUMBER(-32768, 32767),
    tbMarginBottom: NUMBER(-32768, 32767),
    tbVerticalAlign: ENUM('Top', 'Center', 'Bottom'),
    roundRate: NUMBER(0, 100),
    connectorType: NUMBER(0, 255),
    connectorMidX: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
    connectorMidY: NUMBER(-0x8000_0000, 0x7FFF_FFFF),
  }),
});

const HWP_ONLY_FORMAT_PROPERTIES = Object.freeze({
  paragraph: Object.freeze(new Set(['keepWithNext', 'keepLines'])),
});

function formatError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function validateValue(scope, field, value, rule) {
  if (rule.type === 'boolean' && typeof value !== 'boolean') {
    throw formatError('HWPX_FORMAT_VALUE_INVALID', `${scope}.${field} must be a boolean.`);
  }
  if (rule.type === 'string' && (typeof value !== 'string' || value.trim().length === 0)) {
    throw formatError('HWPX_FORMAT_VALUE_INVALID', `${scope}.${field} must be a nonblank string.`);
  }
  if (rule.type === 'color' && !(Number.isInteger(value) && value >= 0 && value <= 0xFFFF_FFFF)
    && !(typeof value === 'string' && /^#?[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value))) {
    throw formatError('HWPX_FORMAT_VALUE_INVALID', `${scope}.${field} must be a packed integer or RGB/RGBA hex color.`);
  }
  if (rule.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number) || (rule.integer && !Number.isInteger(number))
      || number < rule.minimum || number > rule.maximum) {
      throw formatError('HWPX_FORMAT_VALUE_INVALID', `${scope}.${field} is outside its supported range.`, {
        value, minimum: rule.minimum, maximum: rule.maximum, integer: rule.integer,
      });
    }
  }
  if (rule.type === 'enum' && !rule.values.includes(value)) {
    throw formatError('HWPX_FORMAT_VALUE_INVALID', `${scope}.${field} must be one of the advertised values.`, {
      value, allowed: rule.values,
    });
  }
  if (rule.type === 'array' && (!Array.isArray(value) || value.length !== rule.length
    || value.some(item => !Number.isInteger(Number(item))
      || Number(item) < rule.minimum || Number(item) > rule.maximum))) {
    throw formatError('HWPX_FORMAT_VALUE_INVALID', `${scope}.${field} must contain exactly ${rule.length} bounded integers.`);
  }
  if (rule.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) {
    throw formatError('HWPX_FORMAT_VALUE_INVALID', `${scope}.${field} must be an object.`);
  }
}

function normalizeFormatProperties(scope, properties, { resolveFontId } = {}) {
  const contract = FORMAT_SCOPES[scope];
  if (!contract) {
    throw formatError('HWPX_FORMAT_SCOPE_INVALID', `Unsupported format scope: ${String(scope)}.`, {
      supportedScopes: Object.keys(FORMAT_SCOPES),
    });
  }
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    throw formatError('HWPX_FORMAT_PROPERTIES_REQUIRED', 'format.apply requires a properties object.');
  }
  const unknown = Object.keys(properties).filter(key => !Object.hasOwn(contract, key));
  if (unknown.length) {
    throw formatError('HWPX_FORMAT_PROPERTY_UNSUPPORTED', `Unsupported ${scope} format property: ${unknown.join(', ')}.`, {
      scope, unknown, supported: Object.keys(contract),
    });
  }
  if (Object.keys(properties).length === 0) {
    throw formatError('HWPX_FORMAT_PROPERTIES_REQUIRED', 'format.apply requires at least one property.');
  }
  for (const [field, value] of Object.entries(properties)) {
    validateValue(scope, field, value, contract[field]);
  }
  const normalized = { ...properties };
  if (scope === 'character') {
    if (properties.fontSizePt !== undefined) normalized.fontSize = Math.round(Number(properties.fontSizePt) * 100);
    if (properties.color !== undefined) normalized.textColor = properties.color;
    if (properties.fontFamily !== undefined) {
      if (typeof resolveFontId !== 'function') {
        throw formatError('HWPX_FORMAT_FONT_RESOLVER_REQUIRED', 'fontFamily requires a native font resolver.');
      }
      normalized.fontId = resolveFontId(properties.fontFamily.trim());
    }
    delete normalized.fontSizePt;
    delete normalized.color;
    delete normalized.fontFamily;
  }
  if (scope === 'paragraph' && properties.align !== undefined) {
    normalized.alignment = properties.align;
    delete normalized.align;
  }
  if (scope === 'paragraph' && properties.margins !== undefined) {
    const margins = properties.margins;
    const unknownMargins = Object.keys(margins).filter(key => !['left', 'right'].includes(key));
    if (unknownMargins.length || Object.keys(margins).length === 0) {
      throw formatError('HWPX_FORMAT_VALUE_INVALID', 'paragraph.margins supports only nonempty left/right values.');
    }
    for (const [key, value] of Object.entries(margins)) {
      validateValue(scope, `margins.${key}`, value, NUMBER(-0x8000_0000, 0x7FFF_FFFF));
      normalized[key === 'left' ? 'marginLeft' : 'marginRight'] = Number(value);
    }
    delete normalized.margins;
  }
  if (scope === 'cell' && typeof properties.verticalAlign === 'string') {
    normalized.verticalAlign = { top: 0, center: 1, bottom: 2 }[properties.verticalAlign];
  }
  if (scope === 'table') {
    if (typeof properties.pageBreak === 'string') {
      normalized.pageBreak = { None: 0, CellBreak: 1, RowBreak: 2 }[properties.pageBreak];
    }
    if (typeof properties.captionDirection === 'string') {
      normalized.captionDirection = { Left: 0, Right: 1, Top: 2, Bottom: 3 }[properties.captionDirection];
    }
    if (typeof properties.captionVertAlign === 'string') {
      normalized.captionVertAlign = { Top: 0, Center: 1, Bottom: 2 }[properties.captionVertAlign];
    }
  }
  return normalized;
}

function formatCatalogFields(sourceFormat = '') {
  return Object.fromEntries(Object.entries(FORMAT_SCOPES).map(([scope, fields]) => [
    scope,
    Object.freeze(Object.keys(fields).filter(field =>
      String(sourceFormat).toLowerCase() !== 'hwpx'
      || !(HWP_ONLY_FORMAT_PROPERTIES[scope]?.has(field)))),
  ]));
}

function assertFormatSourceSupport(scope, properties, sourceFormat) {
  if (String(sourceFormat).toLowerCase() !== 'hwpx') return;
  const blocked = [...(HWP_ONLY_FORMAT_PROPERTIES[scope] ?? [])]
    .filter(field => Object.hasOwn(properties ?? {}, field));
  if (blocked.length) {
    throw formatError(
      'HWPX_FORMAT_PROPERTY_REQUIRES_HWP_SOURCE',
      `These ${scope} properties are not losslessly serializable to HWPX in the installed engine: ${blocked.join(', ')}.`,
      { scope, blocked, sourceFormat: 'hwpx' },
    );
  }
}

export {
  FORMAT_SCOPES,
  HWP_ONLY_FORMAT_PROPERTIES,
  assertFormatSourceSupport,
  formatCatalogFields,
  formatError,
  normalizeFormatProperties,
};
