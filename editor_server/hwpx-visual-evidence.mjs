const DEFAULT_ALLOWED_TEXT_COLORS = Object.freeze(['#000000']);
const DEFAULT_HEADING_PATTERN = /^\s*(?:\d+\.\s|\d+-\d+\.\s)/u;

function normalizeHexColor(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text}`;
  return text;
}

function normalizeVisualPolicy(policy = {}, profile = 'structural') {
  const source = policy && typeof policy === 'object' && !Array.isArray(policy) ? policy : {};
  const allowedTextColors = [...new Set(
    (Array.isArray(source.allowedTextColors) ? source.allowedTextColors : DEFAULT_ALLOWED_TEXT_COLORS)
      .map(normalizeHexColor).filter(Boolean),
  )];
  const failOnColoredText = source.failOnColoredText === true || (
    source.failOnColoredText === undefined && profile === 'submission'
  );
  const failOnImageFlow = source.failOnImageFlow === true || (
    source.failOnImageFlow === undefined && profile === 'submission'
  );
  const failOnSparsePages = source.failOnSparsePages === true;
  const minVerticalOccupancy = source.minVerticalOccupancy === undefined
    ? 0.12
    : Number(source.minVerticalOccupancy);
  if (!Number.isFinite(minVerticalOccupancy) || minVerticalOccupancy < 0 || minVerticalOccupancy > 1) {
    throw new Error('visualPolicy.minVerticalOccupancy must be between 0 and 1.');
  }
  let headingPattern = DEFAULT_HEADING_PATTERN;
  if (source.headingPattern instanceof RegExp) headingPattern = source.headingPattern;
  else if (typeof source.headingPattern === 'string' && source.headingPattern.trim()) {
    try { headingPattern = new RegExp(source.headingPattern, 'u'); } catch { /* use the safe default */ }
  }
  return {
    allowedTextColors,
    failOnColoredText,
    failOnImageFlow,
    failOnSparsePages,
    minVerticalOccupancy,
    requireChapterPageBreak: source.requireChapterPageBreak === true,
    requireHeadingKeepWithNext: source.requireHeadingKeepWithNext === true,
    headingPattern,
    expectedBodyFont: typeof source.expectedBodyFont === 'string' && source.expectedBodyFont.trim()
      ? source.expectedBodyFont.trim()
      : null,
    expectedBodyFontSizePt: source.expectedBodyFontSizePt === undefined
      ? null : Number(source.expectedBodyFontSizePt),
    failOnStyleVariance: source.failOnStyleVariance === true,
  };
}

function numberAttribute(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${name}=["'](-?[0-9]+(?:\\.[0-9]+)?)["']`, 'i'));
  return match ? Number(match[1]) : null;
}

function parseBodyClip(svg) {
  const match = String(svg || '').match(/<clipPath\b[^>]*\bid=["']body-clip-[^"']+["'][^>]*>[\s\S]*?<rect\b([^>]*)\/?><\/clipPath>/i);
  if (!match) return null;
  const attrs = match[1];
  const result = {
    x: numberAttribute(attrs, 'x'),
    y: numberAttribute(attrs, 'y'),
    width: numberAttribute(attrs, 'width'),
    height: numberAttribute(attrs, 'height'),
  };
  return Object.values(result).every(Number.isFinite) ? result : null;
}

function parseSvgTextColors(svg) {
  const colors = new Map();
  for (const match of String(svg || '').matchAll(/<text\b([^>]*)>/gi)) {
    const color = normalizeHexColor(match[1].match(/\bfill=["']([^"']+)["']/i)?.[1]);
    if (!color) continue;
    colors.set(color, (colors.get(color) || 0) + 1);
  }
  return colors;
}

function analyzeSvgVisualPage(page, policy) {
  const svg = String(page?.svg || '');
  const issues = [];
  const colors = parseSvgTextColors(svg);
  const allowed = new Set(policy.allowedTextColors);
  const coloredText = [...colors.entries()]
    .filter(([color]) => !allowed.has(color))
    .map(([color, count]) => ({ color, count }));
  if (coloredText.length) {
    issues.push({
      severity: policy.failOnColoredText ? 'error' : 'warning',
      code: 'render-colored-text',
      message: 'Rendered text uses a color outside the explicit visual policy.',
      page: page.page,
      allowedTextColors: policy.allowedTextColors,
      colors: coloredText,
    });
  }

  const metrics = page.layout?.pageMetrics || {};
  if (policy.failOnSparsePages && Number.isFinite(metrics.verticalOccupancy)
    && metrics.verticalOccupancy < policy.minVerticalOccupancy
    && Number(metrics.textCharacters || 0) < 180) {
    issues.push({
      severity: 'error',
      code: 'render-sparse-page',
      message: 'Visible content occupies too little of the page for the active editorial policy.',
      page: page.page,
      verticalOccupancy: metrics.verticalOccupancy,
      textCharacters: metrics.textCharacters,
    });
  }

  const body = parseBodyClip(svg);
  const imageIssues = [];
  for (const match of svg.matchAll(/<image\b([^>]*)\/?>(?:<\/image>)?/gi)) {
    const attrs = match[1];
    const image = {
      x: numberAttribute(attrs, 'x'),
      y: numberAttribute(attrs, 'y'),
      width: numberAttribute(attrs, 'width'),
      height: numberAttribute(attrs, 'height'),
    };
    if (!body || !Object.values(image).every(Number.isFinite)) continue;
    const outside = image.x < body.x - 1 || image.y < body.y - 1
      || image.x + image.width > body.x + body.width + 1
      || image.y + image.height > body.y + body.height + 1;
    if (outside) imageIssues.push(image);
  }
  if (imageIssues.length) {
    issues.push({
      severity: policy.failOnImageFlow ? 'error' : 'warning',
      code: 'render-image-outside-body',
      message: 'Rendered image geometry escapes the page body area; normalize inline flow or size before submission.',
      page: page.page,
      images: imageIssues,
    });
  }
  return {
    colors: Object.fromEntries(colors),
    coloredText,
    imageIssues,
    issues,
  };
}

function headingLike(text, pattern) {
  return pattern.test(String(text || ''));
}

function analyzeHeadingFlow(targetMap, policy) {
  const issues = [];
  const paragraphs = Array.isArray(targetMap?.paragraphs) ? targetMap.paragraphs : [];
  for (const target of paragraphs) {
    const text = String(target.text ?? target.currentText ?? '').trim();
    if (!text || !headingLike(text, policy.headingPattern)) continue;
    const hierarchy = target.hierarchy || {};
    const chapter = /^\d+\.\s/u.test(text);
    if (chapter && policy.requireChapterPageBreak && hierarchy.pageBreakBefore !== true) {
      issues.push({
        severity: 'error',
        code: 'heading-page-break-missing',
        message: 'A chapter heading does not start with an explicit page break.',
        targetId: target.id || target.targetId,
        page: target.pageHint ?? null,
        text: text.slice(0, 160),
      });
    }
    if (policy.requireHeadingKeepWithNext && hierarchy.keepWithNext !== true) {
      issues.push({
        severity: 'error',
        code: 'heading-keep-with-next-missing',
        message: 'A heading is not linked to its following content block.',
        targetId: target.id || target.targetId,
        page: target.pageHint ?? null,
        text: text.slice(0, 160),
      });
    }
  }
  return { issues };
}

function analyzeStyleVariance(json, policy) {
  const paragraphs = (json?.sections || []).flatMap((section) => section.paragraphs || [])
    .filter((paragraph) => String(paragraph.text || '').trim());
  const families = new Map();
  const sizes = new Map();
  const colors = new Map();
  for (const paragraph of paragraphs) {
    const character = paragraph.characterFormat || {};
    const family = String(character.fontFamily || character.fontName || '').trim();
    const rawSize = Number(character.fontSizePt ?? character.fontSize ?? 0);
    const size = rawSize > 100 ? rawSize / 100 : rawSize;
    const color = normalizeHexColor(character.textColor ?? character.color);
    if (family) families.set(family, (families.get(family) || 0) + 1);
    if (Number.isFinite(size) && size > 0) sizes.set(size, (sizes.get(size) || 0) + 1);
    if (color) colors.set(color, (colors.get(color) || 0) + 1);
  }
  const issues = [];
  const familyValues = [...families.keys()];
  const sizeValues = [...sizes.keys()];
  if (policy.expectedBodyFont && familyValues.some((family) => family !== policy.expectedBodyFont)) {
    issues.push({
      severity: policy.failOnStyleVariance ? 'error' : 'warning',
      code: 'style-body-font-inconsistent',
      message: 'Body paragraphs use fonts outside the declared body font.',
      expected: policy.expectedBodyFont,
      observed: familyValues,
    });
  }
  if (Number.isFinite(policy.expectedBodyFontSizePt) && sizeValues.some((size) => size !== policy.expectedBodyFontSizePt)) {
    issues.push({
      severity: policy.failOnStyleVariance ? 'error' : 'warning',
      code: 'style-body-size-inconsistent',
      message: 'Body paragraphs use sizes outside the declared body size.',
      expected: policy.expectedBodyFontSizePt,
      observed: sizeValues,
    });
  }
  return {
    bodyParagraphCount: paragraphs.length,
    fontFamilies: Object.fromEntries(families),
    fontSizes: Object.fromEntries(sizes),
    textColors: Object.fromEntries(colors),
    issues,
  };
}

function analyzeHwpxVisualEvidence({ json, targetMap, renderedPages = [], profile = 'structural', visualPolicy = {} } = {}) {
  const policy = normalizeVisualPolicy(visualPolicy, profile);
  const pageEvidence = renderedPages.map((page) => ({ page: page.page, ...analyzeSvgVisualPage(page, policy) }));
  const heading = analyzeHeadingFlow(targetMap, policy);
  const styles = analyzeStyleVariance(json, policy);
  const issues = [
    ...pageEvidence.flatMap((page) => page.issues),
    ...heading.issues,
    ...styles.issues,
  ];
  return {
    profile,
    policy: {
      ...policy,
      headingPattern: policy.headingPattern.source,
    },
    pages: pageEvidence,
    headings: { issueCount: heading.issues.length, issues: heading.issues },
    styles,
    issues,
    ok: issues.every((issue) => issue.severity !== 'error'),
  };
}

export {
  DEFAULT_ALLOWED_TEXT_COLORS,
  analyzeHwpxVisualEvidence,
  normalizeVisualPolicy,
};
