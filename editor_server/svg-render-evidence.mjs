export function svgHasVisibleContent(value) {
  const drawableBody = String(value || '')
    .replace(/<defs\b[\s\S]*?<\/defs>/gi, '')
    .replace(/<!--[^]*?-->/g, '');
  if (/<(?:text|image|path|line|polyline|polygon|circle|ellipse|use|foreignObject)\b/i.test(drawableBody)) {
    return true;
  }
  return (drawableBody.match(/<rect\b[^>]*>/gi) || []).some((tag) => (
    /\bstroke\s*=/i.test(tag)
    || !/\bfill\s*=\s*["'](?:#fff(?:fff)?|white)["']/i.test(tag)
  ));
}

function numberAttribute(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${name}=["'](-?[0-9]+(?:\\.[0-9]+)?)["']`, 'i'));
  return match ? Number(match[1]) : null;
}

function clipProvenance(tag) {
  const section = numberAttribute(tag, 'data-section');
  const paragraph = numberAttribute(tag, 'data-paragraph');
  const control = numberAttribute(tag, 'data-control');
  const cellIndex = numberAttribute(tag, 'data-cell-index');
  const row = numberAttribute(tag, 'data-row');
  const column = numberAttribute(tag, 'data-column');
  if (![section, paragraph, control, cellIndex].every((value) => Number.isInteger(value) && value >= 0)) {
    return null;
  }
  return {
    native: { section, paragraph, control },
    cell: {
      number: cellIndex,
      ...(Number.isInteger(row) && row >= 0 ? { row } : {}),
      ...(Number.isInteger(column) && column >= 0 ? { column } : {}),
    },
  };
}

function clippedGroups(svg) {
  const groups = [];
  const openingPattern = /<g\b[^>]*\bclip-path=["']url\(#(cell-clip-[^)"']+)\)["'][^>]*>/gi;
  for (const opening of svg.matchAll(openingPattern)) {
    const bodyStart = opening.index + opening[0].length;
    const tagPattern = /<\/?g\b[^>]*>/gi;
    tagPattern.lastIndex = bodyStart;
    let depth = 1;
    let closingStart = svg.length;
    for (let tag = tagPattern.exec(svg); tag; tag = tagPattern.exec(svg)) {
      if (/^<\/g\b/i.test(tag[0])) depth -= 1;
      else if (!/\/>$/.test(tag[0])) depth += 1;
      if (depth === 0) {
        closingStart = tag.index;
        break;
      }
    }
    groups.push({
      clipId: opening[1],
      body: svg.slice(bodyStart, closingStart),
      provenance: clipProvenance(opening[0]),
    });
  }
  return groups;
}

/**
 * Detect drawable text that exists in the SVG but is hidden by a table-cell
 * clip rectangle.  A nonblank-page check cannot see this failure because the
 * clipped glyphs are still present in the SVG source.
 */
export function analyzeSvgCellClipping(value, options = {}) {
  const svg = String(value || '');
  const tolerance = Math.max(0, Number(options.tolerance ?? 1.5));
  const ascentRatio = Math.max(0, Number(options.ascentRatio ?? 0.82));
  const descentRatio = Math.max(0, Number(options.descentRatio ?? 0.22));
  const clips = new Map();
  for (const match of svg.matchAll(/<clipPath\b[^>]*\bid=["'](cell-clip-[^"']+)["'][^>]*>([\s\S]*?)<\/clipPath>/gi)) {
    const rect = match[2].match(/<rect\b[^>]*>/i)?.[0];
    if (!rect) continue;
    const x = numberAttribute(rect, 'x');
    const y = numberAttribute(rect, 'y');
    const width = numberAttribute(rect, 'width');
    const height = numberAttribute(rect, 'height');
    if ([x, y, width, height].every(Number.isFinite)) {
      clips.set(match[1], {
        x, y, width, height,
        provenance: clipProvenance(match[0]),
      });
    }
  }

  const issues = [];
  for (const group of clippedGroups(svg)) {
    const clipId = group.clipId;
    const clip = clips.get(clipId);
    if (!clip) continue;
    let clippedDrawableCount = 0;
    const samples = [];
    for (const textMatch of group.body.matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/gi)) {
      const tag = textMatch[0].match(/<text\b[^>]*>/i)?.[0] || '';
      const text = textMatch[0].replace(/<[^>]+>/g, '');
      if (!text.trim()) continue;
      const x = numberAttribute(tag, 'x');
      const baseline = numberAttribute(tag, 'y');
      const fontSize = numberAttribute(tag, 'font-size') ?? 0;
      const textLength = numberAttribute(tag, 'textLength');
      if (!Number.isFinite(x) || !Number.isFinite(baseline)) continue;
      const glyphTop = baseline - fontSize * ascentRatio;
      const glyphBottom = baseline + fontSize * descentRatio;
      const glyphRight = x + (Number.isFinite(textLength) ? textLength : 0);
      const verticalClip = glyphTop < clip.y - tolerance
        || glyphBottom > clip.y + clip.height + tolerance;
      const horizontalClip = x < clip.x - tolerance
        || (Number.isFinite(textLength) && glyphRight > clip.x + clip.width + tolerance);
      if (verticalClip || horizontalClip) {
        clippedDrawableCount += 1;
        if (samples.length < 5) {
          samples.push({
            x,
            baseline,
            fontSize,
            textLength,
            text: text.slice(0, 40),
            verticalClip,
            horizontalClip,
          });
        }
      }
    }
    if (clippedDrawableCount > 0) {
      const provenance = group.provenance ?? clip.provenance ?? null;
      issues.push({
        clipId,
        clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height },
        ...(provenance ? { provenance } : {}),
        clippedDrawableCount,
        samples,
      });
    }
  }
  return { ok: issues.length === 0, clipCount: clips.size, issues };
}

export function analyzeSvgPageMetrics(value) {
  const svg = String(value || '');
  const root = svg.match(/<svg\b[^>]*>/i)?.[0] || '';
  const viewBox = root.match(/\bviewBox=["'](-?[0-9.]+)\s+(-?[0-9.]+)\s+([0-9.]+)\s+([0-9.]+)["']/i);
  const width = viewBox ? Number(viewBox[3]) : numberAttribute(root, 'width');
  const height = viewBox ? Number(viewBox[4]) : numberAttribute(root, 'height');
  const texts = [...svg.matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/gi)].map((match) => {
    const tag = match[0].match(/<text\b[^>]*>/i)?.[0] || '';
    return {
      text: match[0].replace(/<[^>]+>/g, '').trim(),
      x: numberAttribute(tag, 'x'),
      y: numberAttribute(tag, 'y'),
      fontSize: numberAttribute(tag, 'font-size'),
      textLength: numberAttribute(tag, 'textLength'),
    };
  }).filter((item) => item.text);
  const fontSizes = texts.map((item) => item.fontSize).filter(Number.isFinite);
  const lineBaselines = [...new Set(texts.map((item) => item.y).filter(Number.isFinite).map((y) => Math.round(y * 10) / 10))];
  const imageCount = (svg.match(/<image\b/gi) || []).length;
  const images = [...svg.matchAll(/<image\b[^>]*>/gi)].map((match) => ({
    x: numberAttribute(match[0], 'x'),
    y: numberAttribute(match[0], 'y'),
    width: numberAttribute(match[0], 'width'),
    height: numberAttribute(match[0], 'height'),
  }));
  const drawableCount = texts.length
    + imageCount
    + (svg.match(/<(?:path|line|polyline|polygon|circle|ellipse|use)\b/gi) || []).length;
  const boxes = [
    ...texts.filter(item => Number.isFinite(item.x) && Number.isFinite(item.y)).map(item => ({
      left: item.x,
      top: item.y - Number(item.fontSize || 0),
      right: item.x + Number(item.textLength || 0),
      bottom: item.y + Number(item.fontSize || 0) * 0.25,
    })),
    ...images.filter(item => [item.x, item.y, item.width, item.height].every(Number.isFinite)).map(item => ({
      left: item.x, top: item.y, right: item.x + item.width, bottom: item.y + item.height,
    })),
  ];
  const contentBox = boxes.length ? {
    left: Math.min(...boxes.map(box => box.left)),
    top: Math.min(...boxes.map(box => box.top)),
    right: Math.max(...boxes.map(box => box.right)),
    bottom: Math.max(...boxes.map(box => box.bottom)),
  } : null;
  const verticalOccupancy = contentBox && Number.isFinite(height) && height > 0
    ? Math.max(0, Math.min(1, (contentBox.bottom - contentBox.top) / height)) : null;
  return {
    page: { width: Number.isFinite(width) ? width : null, height: Number.isFinite(height) ? height : null },
    textCount: texts.length,
    lineCount: lineBaselines.length,
    imageCount,
    drawableCount,
    minFontSize: fontSizes.length ? Math.min(...fontSizes) : null,
    maxFontSize: fontSizes.length ? Math.max(...fontSizes) : null,
    textCharacters: texts.reduce((sum, item) => sum + item.text.length, 0),
    contentBox,
    verticalOccupancy,
    sparseContent: texts.length <= 3 && imageCount === 0
      && texts.reduce((sum, item) => sum + item.text.length, 0) < 100,
  };
}
