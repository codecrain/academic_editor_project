import {
  isPublicProposalProfile,
  isSubmissionProfile,
  normalizeHwpxReviewProfile,
} from './hwpx-review-profile.mjs';

const DEFAULT_UNRESOLVED_PATTERNS = Object.freeze([
  /(?:재)?확인\s*필요/iu,
  /(?:자료|정보|근거|증빙)\s*(?:가\s*)?(?:미제공|없음|누락)/u,
  /(?:추후|향후)\s*(?:확정|기재|제출|보완)/u,
  /(?:^|\s)(?:TBD|TODO)(?:\s|$)/iu,
  /(?:^|\s)미정(?:\s|$)/u,
  /[\[<〈](?:입력|작성|기재)[^\]>〉]*[\]>〉]/u,
]);

const INSTRUCTION_PATTERNS = Object.freeze([
  /작성\s*요령/u,
  /작성\s*시\s*(?:참고|유의|에는|도표|삭제|제출|작성)/u,
  /오프라인\s*작성\s*시/u,
  /작성\s*후\s*삭제/u,
  /제출하지\s*(?:않습니다|마십시오)/u,
  /(?:간략히|상세히)?\s*서술(?:합니다|하십시오|할 것)?/u,
  /(?:충실히|반드시)?\s*기재(?:합니다|하십시오|해야)/u,
  /작성\s*예시/u,
]);

const CONDITIONAL_PATTERNS = Object.freeze([
  /해당\s*시/u,
  /해당사항이\s*있는\s*경우/u,
  /선택\s*시/u,
  /작성\s*제외/u,
]);

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function targetText(target) {
  return normalizeText(target?.currentText ?? target?.text);
}

function targetLocation(target) {
  return target?.location ?? (target?.native ? { native: target.native } : null);
}

function stableLocationKey(location) {
  if (!location || typeof location !== 'object') return null;
  if (location.tableId && location.cell) {
    const cell = location.cell;
    const number = Number.isInteger(Number(cell.number)) ? Number(cell.number) : null;
    const row = Number.isInteger(Number(cell.row)) ? Number(cell.row) : null;
    const column = Number.isInteger(Number(cell.column)) ? Number(cell.column) : null;
    return number !== null ? `table:${location.tableId}/cell:${number}`
      : row !== null && column !== null ? `table:${location.tableId}/row:${row}/column:${column}` : null;
  }
  const paragraph = location.paragraph ?? location.native;
  const section = Number(paragraph?.section ?? paragraph?.sectionIndex);
  const number = Number(paragraph?.number ?? paragraph?.paragraph ?? paragraph?.para ?? paragraph?.paragraphIndex);
  return Number.isInteger(section) && Number.isInteger(number) ? `paragraph:${section}:${number}` : null;
}

function editableTargets(json = {}) {
  return [
    ...(json.editableTargets?.paragraphs ?? []),
    ...(json.editableTargets?.cells ?? []),
  ];
}

function matchesAny(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

function issueTarget(target, text) {
  return {
    targetId: target?.id ?? target?.targetId ?? null,
    kind: target?.kind ?? null,
    pageHint: Number(target?.pageHint) || null,
    location: targetLocation(target),
    text: text.slice(0, 160),
  };
}

function executionMarker(text) {
  if (/(?:서명|직인)\s*(?:생략|불필요|제외|가능)/u.test(text)) return false;
  return /(?:대표자|책임자|신청인|법인명)[^\n]{0,80}(?:\(인\)|서명|직인)|자필\s*서명/u.test(text);
}

function targetPictureCount(target) {
  const direct = Number(target?.pictureCount ?? target?.cell?.pictureCount);
  if (Number.isFinite(direct)) return direct;
  return 0;
}

function normalizedRect(value) {
  const source = value?.bbox ?? value?.bounds ?? value;
  const x = Number(source?.x);
  const y = Number(source?.y);
  const width = Number(source?.width ?? source?.w);
  const height = Number(source?.height ?? source?.h);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function pictureInsideTargetCell(picture, target) {
  const pictureRect = normalizedRect(picture?.bounds ?? picture?.placement?.bounds);
  const cellRect = normalizedRect(target?.layout);
  if (!pictureRect || !cellRect) return false;
  const picturePage = Number(picture?.pageHint);
  const targetPage = Number(target?.pageHint ?? target?.layout?.pageHint ?? target?.layout?.pageIndex) + (
    target?.pageHint ? 0 : Number.isFinite(Number(target?.layout?.pageIndex)) ? 1 : 0
  );
  if (Number.isFinite(picturePage) && Number.isFinite(targetPage) && picturePage !== targetPage) return false;
  const centerX = pictureRect.x + pictureRect.width / 2;
  const centerY = pictureRect.y + pictureRect.height / 2;
  return centerX >= cellRect.x && centerX <= cellRect.x + cellRect.width
    && centerY >= cellRect.y && centerY <= cellRect.y + cellRect.height;
}

function targetHasExecutionPicture(target, pictures) {
  return targetPictureCount(target) > 0 || pictures.some((picture) => pictureInsideTargetCell(picture, target));
}

function normalizedPolicyLocations(policy, field) {
  return new Set((policy?.[field] ?? []).map(stableLocationKey).filter(Boolean));
}

export function suggestHwpxTemplateRegions(json = {}, policy = {}) {
  const explicitRequired = normalizedPolicyLocations(policy, 'requiredLocations');
  const explicitInstruction = normalizedPolicyLocations(policy, 'instructionLocations');
  const explicitFreeform = normalizedPolicyLocations(policy, 'freeformLocations');
  const suggestions = [];
  for (const target of editableTargets(json)) {
    const text = targetText(target);
    if (!text) continue;
    const location = targetLocation(target);
    const key = stableLocationKey(location);
    let role = null;
    let confidence = null;
    const reasons = [];
    if (key && explicitRequired.has(key)) {
      role = 'fillable-required'; confidence = 'explicit'; reasons.push('templatePolicy.requiredLocations');
    } else if (key && explicitInstruction.has(key)) {
      role = 'instruction'; confidence = 'explicit'; reasons.push('templatePolicy.instructionLocations');
    } else if (key && explicitFreeform.has(key)) {
      role = 'freeform'; confidence = 'explicit'; reasons.push('templatePolicy.freeformLocations');
    } else if (matchesAny(text, INSTRUCTION_PATTERNS)) {
      role = 'instruction'; confidence = 'high'; reasons.push('author-facing instruction phrase');
    } else if (matchesAny(text, CONDITIONAL_PATTERNS)) {
      role = 'conditional'; confidence = 'medium'; reasons.push('conditional phrase');
    } else if (matchesAny(text, DEFAULT_UNRESOLVED_PATTERNS)) {
      role = 'fillable-unresolved'; confidence = 'high'; reasons.push('unresolved placeholder phrase');
    }
    if (role) suggestions.push({ role, confidence, reasons, ...issueTarget(target, text) });
  }
  return suggestions;
}

export function analyzeHwpxSemanticEvidence(json = {}, options = {}) {
  const profile = normalizeHwpxReviewProfile(options.profile);
  const submission = isSubmissionProfile(profile);
  const publicProposal = isPublicProposalProfile(profile);
  const policy = options.templatePolicy ?? {};
  const required = normalizedPolicyLocations(policy, 'requiredLocations');
  const instructions = normalizedPolicyLocations(policy, 'instructionLocations');
  const allowedUnresolved = normalizedPolicyLocations(policy, 'allowedUnresolvedLocations');
  const targets = editableTargets(json);
  const pictures = json.objectGraph?.pictures ?? [];
  const issues = [];
  const signals = {
    unresolvedTargets: [], instructionTargets: [], requiredBlankTargets: [],
    dummyIdentifierTargets: [], blankExecutionTargets: [], missingExecutionObjectTargets: [],
    riskyFloatingImages: [],
  };

  for (const target of targets) {
    const text = targetText(target);
    const location = targetLocation(target);
    const key = stableLocationKey(location);
    if (key && required.has(key) && !text) {
      const evidence = issueTarget(target, text);
      signals.requiredBlankTargets.push(evidence);
      issues.push({ severity: 'error', code: 'submission-required-target-blank', message: 'A target explicitly required by the template policy is blank.', ...evidence });
    }
    if (!text) continue;
    if (matchesAny(text, DEFAULT_UNRESOLVED_PATTERNS) && !(key && allowedUnresolved.has(key))) {
      const evidence = issueTarget(target, text);
      signals.unresolvedTargets.push(evidence);
      issues.push({ severity: submission ? 'error' : 'info', code: 'submission-unresolved-placeholder', message: 'Visible document text still contains an unresolved or unavailable-data placeholder.', ...evidence });
    }
    if (matchesAny(text, INSTRUCTION_PATTERNS)) {
      const evidence = issueTarget(target, text);
      signals.instructionTargets.push(evidence);
      issues.push({
        severity: submission && (publicProposal || key && instructions.has(key)) ? 'error' : 'info',
        code: 'submission-author-instruction-remains',
        message: key && instructions.has(key)
          ? 'An explicitly classified author instruction remains in the submission.'
          : 'Visible text resembles author-facing template guidance; classify it explicitly before removal.',
        ...evidence,
      });
    }
    if (/(?:000000|111111|999999)[-\s]?(?:0000000|1111111|9999999)/u.test(text)) {
      const evidence = issueTarget(target, text);
      signals.dummyIdentifierTargets.push(evidence);
      issues.push({ severity: submission ? 'error' : 'info', code: 'submission-dummy-identifier', message: 'Visible text contains a dummy personal identifier.', ...evidence });
    }
    if (/(?:년\s+월\s+일|대표자\s*:\s*\(인\)|책임자\s*:\s*\(인\))/u.test(text)) {
      const evidence = issueTarget(target, text);
      signals.blankExecutionTargets.push(evidence);
      issues.push({ severity: submission ? 'error' : 'info', code: 'submission-blank-date-or-signature', message: 'A date or signature execution field appears incomplete.', ...evidence });
    }
    if (publicProposal && executionMarker(text) && !targetHasExecutionPicture(target, pictures)) {
      const evidence = { ...issueTarget(target, text), pictureCount: targetPictureCount(target), spatialPictureCount: 0 };
      signals.missingExecutionObjectTargets.push(evidence);
      issues.push({
        severity: 'error',
        code: 'submission-execution-object-missing',
        message: 'A proposal signature or seal field contains only text; a persisted picture/signature object or an explicit electronic-signature exemption is required.',
        ...evidence,
      });
    }
  }

  for (const picture of pictures) {
    const properties = picture.properties ?? {};
    const paperAnchored = ['Paper', 'Page'].includes(properties.vertRelTo)
      || ['Paper', 'Page'].includes(properties.horzRelTo);
    const originPinned = Number(properties.vertOffset || 0) === 0 && Number(properties.horzOffset || 0) === 0;
    const containedByCell = targets.some((target) => target?.kind === 'cell' && pictureInsideTargetCell(picture, target));
    const flowRisk = properties.treatAsChar === false && paperAnchored && !containedByCell
      && (originPinned || properties.textWrap === 'Square');
    if (!flowRisk) continue;
    const evidence = {
      imageId: picture.id ?? null,
      pageHint: Number(picture.pageHint) || null,
      native: picture.native ?? null,
      properties: {
        treatAsChar: properties.treatAsChar,
        textWrap: properties.textWrap,
        vertRelTo: properties.vertRelTo,
        horzRelTo: properties.horzRelTo,
        vertOffset: properties.vertOffset,
        horzOffset: properties.horzOffset,
        containedByCell,
      },
    };
    signals.riskyFloatingImages.push(evidence);
    issues.push({ severity: submission ? 'error' : 'warning', code: 'render-floating-image-flow-risk', message: 'A floating image is anchored to paper/page and may overlap or detach from its paragraph flow.', ...evidence });
  }

  return {
    profile,
    ok: issues.every(issue => issue.severity !== 'error'),
    counts: Object.fromEntries(Object.entries(signals).map(([key, value]) => [key, value.length])),
    signals,
    issues,
  };
}

export { stableLocationKey };
