function normalizeHexColor(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text}`;
  return text;
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
    if (color) colors.set(color, (colors.get(color) || 0) + 1);
  }
  return Object.fromEntries(colors);
}

function analyzeSvgVisualPage(page) {
  const svg = String(page?.svg || '');
  const body = parseBodyClip(svg);
  const images = [];
  for (const match of svg.matchAll(/<image\b([^>]*)\/?>(?:<\/image>)?/gi)) {
    const attrs = match[1];
    const image = {
      x: numberAttribute(attrs, 'x'),
      y: numberAttribute(attrs, 'y'),
      width: numberAttribute(attrs, 'width'),
      height: numberAttribute(attrs, 'height'),
    };
    if (body && Object.values(image).every(Number.isFinite)) {
      const bodyCenter = body.x + body.width / 2;
      const imageCenter = image.x + image.width / 2;
      image.widthRatio = image.width / body.width;
      image.centerOffsetRatio = Math.abs(imageCenter - bodyCenter) / body.width;
      image.insideBody = image.x >= body.x - 1 && image.y >= body.y - 1
        && image.x + image.width <= body.x + body.width + 1
        && image.y + image.height <= body.y + body.height + 1;
    }
    images.push(image);
  }
  return {
    colors: parseSvgTextColors(svg),
    body,
    images,
    metrics: page?.layout?.pageMetrics || {},
  };
}

function analyzeStyleEvidence(json) {
  const families = new Map();
  const sizes = new Map();
  const colors = new Map();
  let paragraphCount = 0;
  for (const paragraph of (json?.sections || []).flatMap((section) => section.paragraphs || [])) {
    if (!String(paragraph.text || '').trim()) continue;
    paragraphCount += 1;
    const character = paragraph.characterFormat || {};
    const family = String(character.fontFamily || character.fontName || '').trim();
    const rawSize = Number(character.fontSizePt ?? character.fontSize ?? 0);
    const size = rawSize > 100 ? rawSize / 100 : rawSize;
    const color = normalizeHexColor(character.textColor ?? character.color);
    if (family) families.set(family, (families.get(family) || 0) + 1);
    if (Number.isFinite(size) && size > 0) sizes.set(size, (sizes.get(size) || 0) + 1);
    if (color) colors.set(color, (colors.get(color) || 0) + 1);
  }
  const dominant = (map) => [...map.entries()].sort((left, right) => right[1] - left[1])[0] || [null, 0];
  const dominantFont = dominant(families);
  const dominantSize = dominant(sizes);
  return {
    paragraphCount,
    fontFamilies: Object.fromEntries(families),
    fontSizesPt: Object.fromEntries(sizes),
    textColors: Object.fromEntries(colors),
    dominantFont: dominantFont[0],
    dominantFontRatio: paragraphCount ? dominantFont[1] / paragraphCount : null,
    dominantFontSizePt: dominantSize[0] === null ? null : Number(dominantSize[0]),
    dominantFontSizeRatio: paragraphCount ? dominantSize[1] / paragraphCount : null,
  };
}

function analyzeTargetFlow(targetMap) {
  const targets = [
    ...(Array.isArray(targetMap?.paragraphs) ? targetMap.paragraphs : []),
    ...(Array.isArray(targetMap?.cells) ? targetMap.cells : []),
  ].filter((target) => String(target.text ?? target.currentText ?? '').trim());
  const pageCounts = new Map();
  const hierarchyCounts = new Map();
  for (const target of targets) {
    const page = target.pageHint ?? 'unknown';
    pageCounts.set(page, (pageCounts.get(page) || 0) + 1);
    const hierarchy = target.hierarchy || {};
    const key = `${hierarchy.headType ?? 'unknown'}:${hierarchy.paraLevel ?? 'unknown'}`;
    hierarchyCounts.set(key, (hierarchyCounts.get(key) || 0) + 1);
  }
  const project = (target) => ({
    targetId: target.id || target.targetId,
    kind: target.kind,
    page: target.pageHint ?? null,
    textPreview: String(target.text ?? target.currentText ?? '').trim().slice(0, 160),
    hierarchy: target.hierarchy || null,
    characterFormat: target.characterFormat || null,
  });
  return {
    targetCount: targets.length,
    pageCounts: Object.fromEntries(pageCounts),
    hierarchyCounts: Object.fromEntries(hierarchyCounts),
    examples: targets.slice(0, 20).map(project),
    examplesTruncated: targets.length > 20,
    fullEvidenceView: 'editor_hwpx_inspect(view="outline")',
  };
}

function analyzeHwpxVisualEvidence({ json, targetMap, renderedPages = [] } = {}) {
  const pages = renderedPages.map((page) => ({ page: page.page, ...analyzeSvgVisualPage(page) }));
  const occupancies = pages.map((page) => Number(page.metrics.verticalOccupancy))
    .filter(Number.isFinite).sort((left, right) => left - right);
  return {
    interpretation: 'objective-only',
    pages,
    occupancy: {
      medianVerticalOccupancy: occupancies.length ? occupancies[Math.floor(occupancies.length / 2)] : null,
    },
    styles: analyzeStyleEvidence(json),
    targetFlow: analyzeTargetFlow(targetMap),
  };
}

export { analyzeHwpxVisualEvidence };
