function textCharacters(json = {}) {
  const blockText = (json.blocks || []).reduce((sum, block) => sum + String(block.text || '').trim().length, 0);
  const cellText = (json.tables || []).reduce((sum, table) => sum + (table.cells || [])
    .reduce((cellSum, cell) => cellSum + String(cell.text || '').trim().length, 0), 0);
  return blockText + cellText;
}

function documentMetrics(json = {}, renderedLayout = null) {
  const occupancies = (renderedLayout?.pages || [])
    .map((page) => Number(page.verticalOccupancy)).filter(Number.isFinite).sort((a, b) => a - b);
  const medianVerticalOccupancy = occupancies.length ? occupancies[Math.floor(occupancies.length / 2)] : null;
  return {
    pageCount: Number(json.pageCount || 0),
    paragraphCount: Number(json.paragraphCount ?? json.blocks?.length ?? 0),
    tableCount: Number(json.tableCount ?? json.tables?.length ?? 0),
    pictureCount: Number(json.objectCounts?.pictures ?? json.objectGraph?.pictures?.length ?? 0),
    imageCount: Number(json.objectCounts?.images ?? json.objectGraph?.images?.length ?? 0),
    textCharacters: textCharacters(json),
    medianVerticalOccupancy,
  };
}

function safeRatio(finalValue, templateValue) {
  const baseline = Math.max(1, Number(templateValue || 0));
  return Number(finalValue || 0) / baseline;
}

function normalizeReferenceComparisonPolicy(policy = {}) {
  const number = (name, fallback, min = 0, max = Number.POSITIVE_INFINITY) => {
    const value = policy[name] === undefined ? fallback : Number(policy[name]);
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`referenceComparison.${name} must be between ${min} and ${max}.`);
    }
    return value;
  };
  return {
    minTextGrowthFactor: number('minTextGrowthFactor', 0.5, 0, 10),
    minPageGrowthFactor: number('minPageGrowthFactor', 0.5, 0, 10),
    minParagraphGrowthFactor: number('minParagraphGrowthFactor', 0.5, 0, 10),
    minTableGrowthFactor: number('minTableGrowthFactor', 0.5, 0, 10),
    minPictureCountFactor: number('minPictureCountFactor', 0.25, 0, 10),
    maxMedianOccupancyGap: number('maxMedianOccupancyGap', 0.15, 0, 1),
  };
}

function analyzeHwpxReferenceTransformation({
  referenceTemplate,
  referenceFinal,
  targetTemplate,
  candidate,
  referenceFinalRenderedLayout = null,
  candidateRenderedLayout = null,
  policy = {},
} = {}) {
  const normalizedPolicy = normalizeReferenceComparisonPolicy(policy);
  const metrics = {
    referenceTemplate: documentMetrics(referenceTemplate),
    referenceFinal: documentMetrics(referenceFinal, referenceFinalRenderedLayout),
    targetTemplate: documentMetrics(targetTemplate),
    candidate: documentMetrics(candidate, candidateRenderedLayout),
  };
  const ratios = {
    reference: {
      pages: safeRatio(metrics.referenceFinal.pageCount, metrics.referenceTemplate.pageCount),
      text: safeRatio(metrics.referenceFinal.textCharacters, metrics.referenceTemplate.textCharacters),
      paragraphs: safeRatio(metrics.referenceFinal.paragraphCount, metrics.referenceTemplate.paragraphCount),
      tables: safeRatio(metrics.referenceFinal.tableCount, metrics.referenceTemplate.tableCount),
    },
    candidate: {
      pages: safeRatio(metrics.candidate.pageCount, metrics.targetTemplate.pageCount),
      text: safeRatio(metrics.candidate.textCharacters, metrics.targetTemplate.textCharacters),
      paragraphs: safeRatio(metrics.candidate.paragraphCount, metrics.targetTemplate.paragraphCount),
      tables: safeRatio(metrics.candidate.tableCount, metrics.targetTemplate.tableCount),
    },
  };
  const checks = [];
  const check = (name, expected, actual, pass) => checks.push({ name, expected, actual, pass: Boolean(pass) });
  check(
    'pageGrowth',
    ratios.reference.pages * normalizedPolicy.minPageGrowthFactor,
    ratios.candidate.pages,
    ratios.candidate.pages >= ratios.reference.pages * normalizedPolicy.minPageGrowthFactor,
  );
  check(
    'textGrowth',
    ratios.reference.text * normalizedPolicy.minTextGrowthFactor,
    ratios.candidate.text,
    ratios.candidate.text >= ratios.reference.text * normalizedPolicy.minTextGrowthFactor,
  );
  check(
    'paragraphGrowth',
    ratios.reference.paragraphs * normalizedPolicy.minParagraphGrowthFactor,
    ratios.candidate.paragraphs,
    ratios.candidate.paragraphs >= ratios.reference.paragraphs * normalizedPolicy.minParagraphGrowthFactor,
  );
  check(
    'tableGrowth',
    ratios.reference.tables * normalizedPolicy.minTableGrowthFactor,
    ratios.candidate.tables,
    ratios.candidate.tables >= ratios.reference.tables * normalizedPolicy.minTableGrowthFactor,
  );
  check(
    'pictureCount',
    Math.ceil(metrics.referenceFinal.pictureCount * normalizedPolicy.minPictureCountFactor),
    metrics.candidate.pictureCount,
    metrics.candidate.pictureCount >= Math.ceil(metrics.referenceFinal.pictureCount * normalizedPolicy.minPictureCountFactor),
  );
  if (Number.isFinite(metrics.referenceFinal.medianVerticalOccupancy)
    && Number.isFinite(metrics.candidate.medianVerticalOccupancy)) {
    check(
      'medianVerticalOccupancyGap',
      normalizedPolicy.maxMedianOccupancyGap,
      Math.abs(metrics.referenceFinal.medianVerticalOccupancy - metrics.candidate.medianVerticalOccupancy),
      Math.abs(metrics.referenceFinal.medianVerticalOccupancy - metrics.candidate.medianVerticalOccupancy)
        <= normalizedPolicy.maxMedianOccupancyGap,
    );
  }
  const failed = checks.filter((item) => !item.pass);
  return {
    ok: failed.length === 0,
    policy: normalizedPolicy,
    metrics,
    ratios,
    checks,
    failed,
    issues: failed.map((item) => ({
      severity: 'error',
      code: `reference-transformation-${item.name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}-insufficient`,
      message: `Candidate transformation does not meet the declared reference parity threshold for ${item.name}.`,
      check: item,
    })),
  };
}

export {
  analyzeHwpxReferenceTransformation,
  documentMetrics,
  normalizeReferenceComparisonPolicy,
};
