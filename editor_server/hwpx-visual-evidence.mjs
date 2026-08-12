import {
  isPublicProposalProfile,
  isSubmissionProfile,
  normalizeHwpxReviewProfile,
} from './hwpx-review-profile.mjs';

const DEFAULT_ALLOWED_TEXT_COLORS = Object.freeze(['#000000']);
const DEFAULT_HEADING_PATTERN = /^\s*(?:[IVXLC]+\.|\d{1,2}\.(?!\d)|\d{1,2}-\d{1,2}\.?|\d{1,2}\.\d{1,2}\.?)\s/u;

function normalizeHexColor(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text}`;
  return text;
}

function normalizeVisualPolicy(policy = {}, profile = 'structural') {
  const normalizedProfile = normalizeHwpxReviewProfile(profile);
  const submission = isSubmissionProfile(normalizedProfile);
  const publicProposal = isPublicProposalProfile(normalizedProfile);
  const source = policy && typeof policy === 'object' && !Array.isArray(policy) ? policy : {};
  const allowedTextColors = [...new Set(
    (Array.isArray(source.allowedTextColors) ? source.allowedTextColors : DEFAULT_ALLOWED_TEXT_COLORS)
      .map(normalizeHexColor).filter(Boolean),
  )];
  const failOnColoredText = source.failOnColoredText === true || (
    source.failOnColoredText === undefined && submission
  );
  const failOnImageFlow = source.failOnImageFlow === true || (
    source.failOnImageFlow === undefined && submission
  );
  const failOnSparsePages = source.failOnSparsePages === true
    || source.failOnSparsePages === undefined && publicProposal;
  const minVerticalOccupancy = source.minVerticalOccupancy === undefined
    ? publicProposal ? 0.35 : 0.12
    : Number(source.minVerticalOccupancy);
  if (!Number.isFinite(minVerticalOccupancy) || minVerticalOccupancy < 0 || minVerticalOccupancy > 1) {
    throw new Error('visualPolicy.minVerticalOccupancy must be between 0 and 1.');
  }
  let headingPattern = DEFAULT_HEADING_PATTERN;
  if (source.headingPattern instanceof RegExp) headingPattern = source.headingPattern;
  else if (typeof source.headingPattern === 'string' && source.headingPattern.trim()) {
    try { headingPattern = new RegExp(source.headingPattern, 'u'); } catch { /* use the safe default */ }
  }
  const bounded = (name, value, min = 0, max = 1) => {
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`visualPolicy.${name} must be between ${min} and ${max}.`);
    }
    return value;
  };
  return {
    allowedTextColors,
    failOnColoredText,
    failOnImageFlow,
    failOnSparsePages,
    minVerticalOccupancy,
    requireChapterPageBreak: source.requireChapterPageBreak === true
      || source.requireChapterPageBreak === undefined && publicProposal,
    requireHeadingKeepWithNext: source.requireHeadingKeepWithNext === true
      || source.requireHeadingKeepWithNext === undefined && publicProposal,
    headingPattern,
    expectedBodyFont: typeof source.expectedBodyFont === 'string' && source.expectedBodyFont.trim()
      ? source.expectedBodyFont.trim()
      : null,
    expectedBodyFontSizePt: source.expectedBodyFontSizePt === undefined
      ? null : Number(source.expectedBodyFontSizePt),
    failOnStyleVariance: source.failOnStyleVariance === true
      || source.failOnStyleVariance === undefined && publicProposal,
    failOnSmallText: source.failOnSmallText === true
      || source.failOnSmallText === undefined && publicProposal,
    minFontSizePt: bounded('minFontSizePt', source.minFontSizePt === undefined ? publicProposal ? 7.5 : 0 : Number(source.minFontSizePt), 0, 1000),
    minRelativeVerticalOccupancy: source.minRelativeVerticalOccupancy === undefined
      ? publicProposal ? 0.65 : 0 : bounded('minRelativeVerticalOccupancy', Number(source.minRelativeVerticalOccupancy)),
    allowedSparsePages: [...new Set((source.allowedSparsePages || []).map(Number).filter(Number.isInteger))],
    requireCenteredImages: source.requireCenteredImages === true
      || source.requireCenteredImages === undefined && publicProposal,
    maxImageCenterOffsetRatio: bounded('maxImageCenterOffsetRatio', source.maxImageCenterOffsetRatio === undefined ? 0.08 : Number(source.maxImageCenterOffsetRatio)),
    minCenteredImageWidthRatio: bounded('minCenteredImageWidthRatio', source.minCenteredImageWidthRatio === undefined ? 0.2 : Number(source.minCenteredImageWidthRatio)),
    minDominantBodyFontRatio: bounded('minDominantBodyFontRatio', source.minDominantBodyFontRatio === undefined ? publicProposal ? 0.75 : 0 : Number(source.minDominantBodyFontRatio)),
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
  if (policy.failOnSparsePages && !policy.allowedSparsePages.includes(Number(page.page))
    && Number.isFinite(metrics.verticalOccupancy)
    && metrics.verticalOccupancy < policy.minVerticalOccupancy) {
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
  const imageAlignmentIssues = [];
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
    const bodyCenter = body.x + body.width / 2;
    const imageCenter = image.x + image.width / 2;
    const widthRatio = image.width / body.width;
    const centerOffsetRatio = Math.abs(imageCenter - bodyCenter) / body.width;
    if (policy.requireCenteredImages && widthRatio >= policy.minCenteredImageWidthRatio
      && centerOffsetRatio > policy.maxImageCenterOffsetRatio) {
      imageAlignmentIssues.push({ ...image, widthRatio, centerOffsetRatio, bodyCenter, imageCenter });
    }
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
  if (imageAlignmentIssues.length) {
    issues.push({
      severity: 'error',
      code: 'render-image-not-visually-centered',
      message: 'A content image is not centered within the rendered page body area.',
      page: page.page,
      images: imageAlignmentIssues,
    });
  }
  if (policy.failOnSmallText && Number.isFinite(metrics.minFontSize)
    && metrics.minFontSize < policy.minFontSizePt) {
    issues.push({
      severity: 'error',
      code: 'render-font-size-below-policy',
      message: 'Rendered text is smaller than the active editorial readability floor.',
      page: page.page,
      minFontSize: metrics.minFontSize,
      requiredMinFontSize: policy.minFontSizePt,
    });
  }
  return {
    colors: Object.fromEntries(colors),
    coloredText,
    imageIssues,
    imageAlignmentIssues,
    issues,
  };
}

function headingLike(text, pattern) {
  const normalized = String(text || '').trim();
  if (!normalized || normalized.length > 120 || /[\r\n]/u.test(normalized) || /[?？]\s*$/u.test(normalized)) return false;
  pattern.lastIndex = 0;
  return pattern.test(normalized);
}

function characterFontSizePt(target) {
  const character = target?.characterFormat ?? target?.styleFingerprint?.basis?.text ?? {};
  const raw = Number(character.fontSizePt ?? character.fontSize ?? 0);
  return Number.isFinite(raw) && raw > 100 ? raw / 100 : raw;
}

function highConfidenceChapter(target, text) {
  if (!/^\s*(?:[IVXLC]+\.|\d{1,2}\.(?!\d))\s/u.test(text)) return false;
  const hierarchy = target?.hierarchy ?? {};
  const outlineType = String(hierarchy.outlineType ?? hierarchy.headType ?? '').toLowerCase();
  const outlineLevel = Number(hierarchy.outlineLevel);
  const explicitOutline = outlineType && !['none', 'normal', '0'].includes(outlineType)
    || Number.isInteger(outlineLevel) && outlineLevel >= 0 && outlineLevel <= 1;
  return explicitOutline || characterFontSizePt(target) >= 15;
}

function orderedTargets(targetMap) {
  return [
    ...(Array.isArray(targetMap?.paragraphs) ? targetMap.paragraphs : []),
    ...(Array.isArray(targetMap?.cells) ? targetMap.cells : []),
  ].filter((target) => String(target.text ?? target.currentText ?? '').trim())
    .sort((left, right) => {
      const a = left.flow || {};
      const b = right.flow || {};
      return Number(a.section || 0) - Number(b.section || 0)
        || Number(a.paragraph || 0) - Number(b.paragraph || 0)
        || Number(a.order || 0) - Number(b.order || 0);
    });
}

function analyzeHeadingFlow(targetMap, policy) {
  const issues = [];
  const targets = orderedTargets(targetMap);
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const text = String(target.text ?? target.currentText ?? '').trim();
    if (!text || !headingLike(text, policy.headingPattern)) continue;
    const hierarchy = target.hierarchy || {};
    const chapter = highConfidenceChapter(target, text);
    const previous = targets[index - 1];
    const startsRenderedPage = Boolean(previous) && Number.isInteger(Number(target.pageHint))
      && Number(target.pageHint) !== Number(previous?.pageHint);
    if (chapter && policy.requireChapterPageBreak
      && hierarchy.pageBreakBefore !== true && !startsRenderedPage) {
      issues.push({
        severity: 'error',
        code: 'heading-page-break-missing',
        message: 'A chapter heading does not start with an explicit page break.',
        targetId: target.id || target.targetId,
        page: target.pageHint ?? null,
        text: text.slice(0, 160),
      });
    }
    const next = targets[index + 1];
    const keptByRenderedFlow = Number.isInteger(Number(target.pageHint))
      && Number(target.pageHint) === Number(next?.pageHint);
    if (policy.requireHeadingKeepWithNext && hierarchy.keepWithNext !== true && !keptByRenderedFlow) {
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
    .filter((paragraph) => {
      const text = String(paragraph.text || '').trim();
      return text.length >= 20 && !headingLike(text, policy.headingPattern);
    });
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
  const totalFamilies = [...families.values()].reduce((sum, count) => sum + count, 0);
  const dominantFamily = [...families.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const dominantBodyFontRatio = totalFamilies ? dominantFamily[1] / totalFamilies : 1;
  if (policy.minDominantBodyFontRatio > 0 && dominantBodyFontRatio < policy.minDominantBodyFontRatio) {
    issues.push({
      severity: policy.failOnStyleVariance ? 'error' : 'warning',
      code: 'style-body-font-dominance-low',
      message: 'Body typography does not converge on one dominant font family.',
      dominantFont: dominantFamily[0],
      dominantBodyFontRatio,
      requiredRatio: policy.minDominantBodyFontRatio,
      observed: Object.fromEntries(families),
    });
  }
  return {
    bodyParagraphCount: paragraphs.length,
    fontFamilies: Object.fromEntries(families),
    fontSizes: Object.fromEntries(sizes),
    textColors: Object.fromEntries(colors),
    dominantFont: dominantFamily[0],
    dominantBodyFontRatio,
    issues,
  };
}

function analyzeHwpxVisualEvidence({ json, targetMap, renderedPages = [], profile = 'structural', visualPolicy = {} } = {}) {
  const normalizedProfile = normalizeHwpxReviewProfile(profile);
  const policy = normalizeVisualPolicy(visualPolicy, normalizedProfile);
  const pageEvidence = renderedPages.map((page) => ({ page: page.page, ...analyzeSvgVisualPage(page, policy) }));
  const occupancies = pageEvidence
    .filter((page) => !policy.allowedSparsePages.includes(Number(page.page)))
    .map((page) => Number(renderedPages.find((item) => item.page === page.page)?.layout?.pageMetrics?.verticalOccupancy))
    .filter(Number.isFinite).sort((a, b) => a - b);
  const medianOccupancy = occupancies.length
    ? occupancies[Math.floor(occupancies.length / 2)] : null;
  const relativeOccupancyIssues = Number.isFinite(medianOccupancy) && policy.minRelativeVerticalOccupancy > 0
    ? renderedPages.filter((page) => {
        const occupancy = Number(page.layout?.pageMetrics?.verticalOccupancy);
        return !policy.allowedSparsePages.includes(Number(page.page)) && Number.isFinite(occupancy)
          && occupancy < medianOccupancy * policy.minRelativeVerticalOccupancy;
      }).map((page) => ({
        severity: 'error',
        code: 'render-page-relative-occupancy-low',
        message: 'A page is a low-occupancy outlier relative to the document median.',
        page: page.page,
        verticalOccupancy: page.layout?.pageMetrics?.verticalOccupancy,
        medianVerticalOccupancy: medianOccupancy,
        requiredRatio: policy.minRelativeVerticalOccupancy,
      })) : [];
  const heading = analyzeHeadingFlow(targetMap, policy);
  const styles = analyzeStyleVariance(json, policy);
  const issues = [
    ...pageEvidence.flatMap((page) => page.issues),
    ...relativeOccupancyIssues,
    ...heading.issues,
    ...styles.issues,
  ];
  return {
    profile: normalizedProfile,
    policy: {
      ...policy,
      headingPattern: policy.headingPattern.source,
    },
    pages: pageEvidence,
    occupancy: { medianVerticalOccupancy: medianOccupancy, issues: relativeOccupancyIssues },
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
