import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  HwpxApiSession,
  initHwpxRuntime,
} from '../../../editor_hwpx/scripts/hwpx-api-utils.mjs';
import { extractAttachmentEvidence } from './attachment-extractors.mjs';

const datasetRoot = path.resolve('evaluation/hwpx-public-sector-v1');
const sourceRoot = path.join(datasetRoot, 'attachments', 'source');
const goldRoot = path.join(datasetRoot, 'gold');
const generatedAt = '2026-07-27';

const mediaTypes = {
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.hwp': 'application/x-hwp',
  '.hwpx': 'application/vnd.hancom.hwpx',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const attachmentDefinitions = [
  {
    id: 'target-moe-briefing-hwpx',
    filename: 'moe-2025-briefing.hwpx',
    role: 'Primary editable public-sector HWPX with 11 pages, 14 tables, and embedded images.',
    origin: {
      kind: 'official-public',
      url: 'https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=72713&boardSeq=104862&lev=0&m=031102&opType=N&page=1&s=moe',
      publisher: '대한민국 교육부',
      retrievedAt: generatedAt,
    },
    license: '공공누리 제1유형 출처표시',
  },
  {
    id: 'target-blank-generation-hwpx',
    filename: 'blank-generation-template.hwpx',
    role: 'Minimal one-page HWPX template for template-based generation cases.',
    origin: {
      kind: 'repository-fixture',
      url: 'editor_hwpx/samples/hwpx/blank_hwpx.hwpx',
      publisher: 'academic_editor_project fixture',
      retrievedAt: generatedAt,
    },
    license: 'Repository test fixture; internal evaluation use.',
  },
  {
    id: 'target-public-form-hwpx',
    filename: 'public-form-template.hwpx',
    role: 'Two-page structured public form with multiple tables for form-preservation cases.',
    origin: {
      kind: 'repository-fixture',
      url: 'editor_hwpx/samples/api-fixtures/esg-original.hwpx',
      publisher: 'academic_editor_project fixture',
      retrievedAt: generatedAt,
    },
    license: 'Repository test fixture; internal evaluation use.',
  },
  {
    id: 'adversarial-encrypted-moe-hwpx',
    filename: 'moe-2025-work-plan.hwpx',
    role: 'Official encrypted/distribution HWPX used by the separate loader rejection audit.',
    origin: {
      kind: 'official-public',
      url: 'https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=72713&boardSeq=104862&lev=0&m=031102&opType=N&page=1&s=moe',
      publisher: '대한민국 교육부',
      retrievedAt: generatedAt,
    },
    license: '공공누리 제1유형 출처표시',
    notes: 'Contains ODF manifest encryption-data; expected loader result is unsupported_encrypted_hwpx.',
  },
  {
    id: 'source-moe-work-plan-pdf',
    filename: 'moe-2025-work-plan.pdf',
    role: 'Official rendered reference for page-level policy and layout comparison.',
    origin: {
      kind: 'official-public',
      url: 'https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=72713&boardSeq=104862&lev=0&m=031102&opType=N&page=1&s=moe',
      publisher: '대한민국 교육부',
      retrievedAt: generatedAt,
    },
    license: '공공누리 제1유형 출처표시',
  },
  {
    id: 'source-mpva-veterans-xlsx',
    filename: 'mpva-2026-05-veterans-status.xlsx',
    role: 'Official 23-sheet veterans and Agent Orange statistics workbook.',
    origin: {
      kind: 'official-public',
      url: 'https://518.mpva.go.kr/mpva/selectBbsNttList.do?bbsNo=54&key=181',
      publisher: '대한민국 국가보훈부',
      retrievedAt: generatedAt,
    },
    license: '대한민국 공공기관 공개자료; source attribution required.',
  },
  {
    id: 'source-mpva-beneficiaries-xlsx',
    filename: 'mpva-2026-05-beneficiaries-status.xlsx',
    role: 'Official 26-sheet beneficiary workbook containing intentional adversarial #REF! cells in remote columns.',
    origin: {
      kind: 'official-public',
      url: 'https://518.mpva.go.kr/mpva/selectBbsNttList.do?bbsNo=54&key=181',
      publisher: '대한민국 국가보훈부',
      retrievedAt: generatedAt,
    },
    license: '대한민국 공공기관 공개자료; source attribution required.',
    notes: 'Formula-error trap: 기본현황(경합형태별현황)!Z7:AA40 contains #REF! values.',
  },
  {
    id: 'source-procurement-csv',
    filename: 'procurement-evidence.csv',
    role: 'Synthetic cross-agency budget, execution, delay, and sensitive-data evidence.',
    origin: {
      kind: 'generated-fixture',
      url: 'evaluation/hwpx-public-sector-v1/attachments/source/procurement-evidence.csv',
      publisher: 'academic_editor_project evaluation generator',
      retrievedAt: generatedAt,
    },
    license: 'Synthetic evaluation data.',
  },
  {
    id: 'source-decisions-txt',
    filename: 'steering-committee-decisions.txt',
    role: 'Synthetic steering-committee decision rules and acceptance thresholds.',
    origin: {
      kind: 'generated-fixture',
      url: 'evaluation/hwpx-public-sector-v1/attachments/source/steering-committee-decisions.txt',
      publisher: 'academic_editor_project evaluation generator',
      retrievedAt: generatedAt,
    },
    license: 'Synthetic evaluation data.',
  },
  {
    id: 'source-requirements-docx',
    filename: 'public-procurement-requirements.docx',
    role: 'Three-page formal procurement and acceptance-requirements document.',
    origin: {
      kind: 'generated-fixture',
      url: 'evaluation/hwpx-public-sector-v1/scripts/build-supporting-docx.mjs',
      publisher: 'academic_editor_project evaluation generator',
      retrievedAt: generatedAt,
    },
    license: 'Synthetic evaluation data.',
  },
  {
    id: 'source-moe-preview-png',
    filename: 'moe-2025-briefing-preview.png',
    role: 'Official HWPX preview image extracted without transformation.',
    origin: {
      kind: 'derived-official',
      url: 'https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=72713&boardSeq=104862&lev=0&m=031102&opType=N&page=1&s=moe',
      publisher: '대한민국 교육부',
      retrievedAt: generatedAt,
    },
    license: '공공누리 제1유형 출처표시',
  },
  {
    id: 'source-moe-cover-jpg',
    filename: 'moe-2025-briefing-cover.jpg',
    role: 'Official embedded briefing image extracted without transformation.',
    origin: {
      kind: 'derived-official',
      url: 'https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=72713&boardSeq=104862&lev=0&m=031102&opType=N&page=1&s=moe',
      publisher: '대한민국 교육부',
      retrievedAt: generatedAt,
    },
    license: '공공누리 제1유형 출처표시',
  },
  {
    id: 'source-large-legacy-hwp',
    filename: 'adversarial-exam-kor-large.hwp',
    role: '10 MB legacy HWP stress attachment for heterogeneous-input scenarios.',
    origin: {
      kind: 'repository-fixture',
      url: 'editor_hwpx/samples/exam_kor.hwp',
      publisher: 'rhwp upstream sample corpus',
      retrievedAt: generatedAt,
    },
    license: 'Repository sample; internal compatibility evaluation only.',
  },
];

const domains = [
  ['교육행정', '교육격차 해소와 학교업무 경감'],
  ['보훈복지', '보훈대상자 통계와 지원 우선순위'],
  ['재난안전', '재난 대응 사업의 지연과 시설 위험'],
  ['지역균형', '지역대학·소도시 교육기반 투자'],
  ['공공조달', '계약 이행과 검수·집행 위험'],
  ['보건의료', '취약계층 의료지원과 개인정보 통제'],
  ['환경기후', '기후적응 사업의 예산·성과 점검'],
  ['교통물류', '대중교통 취약지역 서비스 개선'],
  ['디지털정부', '행정정보 연계와 데이터 품질'],
  ['청년고용', '직업교육·청년 일자리 연계성과'],
];

const editPatterns = [
  {
    name: '기준일 충돌·수치 교차검증',
    focus: '두 XLSX의 2026년 5월말 기준값과 CSV의 2026-05-31 값을 대조하고, PDF에 적힌 2025년 정책 문구는 기준일이 다른 정성 근거로만 사용하십시오.',
    attachments: ['source-mpva-veterans-xlsx', 'source-mpva-beneficiaries-xlsx', 'source-procurement-csv', 'source-moe-work-plan-pdf'],
    tags: ['cross-file', 'date-reconciliation', 'xlsx', 'csv', 'pdf'],
  },
  {
    name: '집행률·지연 위험등급 반영',
    focus: 'CSV에서 집행률을 다시 계산하고 지연 5건 이상 또는 집행률 60% 미만 기준을 적용하되, 원 단위 근거와 백만원 반올림 표시가 서로 추적 가능해야 합니다.',
    attachments: ['source-procurement-csv', 'source-decisions-txt', 'source-requirements-docx', 'source-mpva-veterans-xlsx'],
    tags: ['budget', 'risk', 'formula', 'docx', 'txt'],
  },
  {
    name: '개인정보 차단·표 구조 보존',
    focus: 'XLSX와 담당자 표에서 개인식별 가능 값은 결과에 전사하지 말고 마스킹 건수만 남기며, 원본 표·그림·머리말·꼬리말 개수는 유지하십시오.',
    attachments: ['source-mpva-beneficiaries-xlsx', 'source-requirements-docx', 'source-decisions-txt', 'source-moe-preview-png'],
    tags: ['privacy', 'table-preservation', 'xlsx', 'image'],
  },
  {
    name: '정책 매트릭스·서식 복제',
    focus: 'PDF의 정책방향, XLSX의 수치, DOCX의 인수조건을 하나의 정책 매트릭스로 요약하되 대상 셀의 기존 문단·글자·테두리 서식을 검사한 뒤 복제하십시오.',
    attachments: ['source-moe-work-plan-pdf', 'source-mpva-veterans-xlsx', 'source-requirements-docx', 'source-procurement-csv'],
    tags: ['policy-matrix', 'style-clone', 'table', 'pdf', 'docx'],
  },
  {
    name: '이미지 근거 교체·객체 보존',
    focus: '공식 이미지 증빙을 확인하고 지정된 기존 이미지 바이트만 교체하거나 재생성하되, 그림·이미지·표 개수와 패키지 관계가 저장 전후 동일해야 합니다.',
    attachments: ['source-moe-preview-png', 'source-moe-cover-jpg', 'source-moe-work-plan-pdf', 'source-requirements-docx'],
    tags: ['image-replace', 'object-preservation', 'package', 'visual'],
  },
  {
    name: '장문 요약·페이지 이동 제한',
    focus: '여러 첨부의 핵심을 공공기관 보고문체로 압축해 삽입하되 원문에 없는 수치를 만들지 말고, 전체 쪽수 증가는 최대 1쪽이며 첫쪽·중간쪽·마지막쪽을 원본과 비교하십시오.',
    attachments: ['source-mpva-veterans-xlsx', 'source-moe-work-plan-pdf', 'source-decisions-txt', 'source-large-legacy-hwp'],
    tags: ['long-summary', 'pagination', 'legacy-hwp', 'render-compare'],
  },
  {
    name: '원격 수식오류 함정·근거 분리',
    focus: '보훈대상자 XLSX의 멀리 떨어진 Z:AA 열 #REF! 오류를 정상 수치로 오인하지 말고, 총괄표의 표시값만 근거로 사용하면서 오류 존재를 검증 메모에 명시하십시오.',
    attachments: ['source-mpva-beneficiaries-xlsx', 'source-mpva-veterans-xlsx', 'source-requirements-docx', 'source-decisions-txt'],
    tags: ['formula-error-trap', 'xlsx', 'evidence-boundary', 'quality'],
  },
  {
    name: '복수 표 셀 원자수정·롤백',
    focus: '서로 다른 표의 여러 셀과 본문을 하나의 리비전 배치로 수정하고, 어떤 대상 하나라도 유효하지 않으면 앞선 수정까지 전부 취소되는 원자성을 전제로 결과를 작성하십시오.',
    attachments: ['source-procurement-csv', 'source-requirements-docx', 'source-decisions-txt', 'source-moe-preview-png'],
    tags: ['atomic-batch', 'multi-table', 'revision', 'rollback'],
  },
  {
    name: '대형 HWP 참고·HWPX 결과 한정',
    focus: '10MB 레거시 HWP는 참고자료로만 읽고 결과 형식은 HWPX로 한정하며, 변환 과정에서 원본 HWP를 덮어쓰거나 HWPX의 객체를 삭제하지 마십시오.',
    attachments: ['source-large-legacy-hwp', 'source-moe-work-plan-pdf', 'source-procurement-csv', 'source-requirements-docx'],
    tags: ['large-file', 'legacy-hwp', 'format-boundary', 'preservation'],
  },
];

const score = {
  contentAccuracy: 35,
  layout: 20,
  styleConsistency: 15,
  objectPreservation: 10,
  packageIntegrity: 10,
  reopenAndApiUsability: 10,
  hardFailures: [
    'saved HWPX cannot be reopened',
    'personal information is copied into the output',
    'failed batch commits a partial edit',
    'unrequested table or image disappears',
  ],
};

const sourceFactByAttachment = new Map([
  ['source-mpva-veterans-xlsx', { locator: '참전(총괄)!B8', fact: 184580 }],
  ['source-mpva-beneficiaries-xlsx', { locator: '기본현황(총괄)!D5', fact: 835702 }],
  ['source-procurement-csv', { locator: 'EDU-04 집행액원/본예산원', fact: '1732500000/2310000000 = 75.0%' }],
  ['source-decisions-txt', { locator: '결정사항 5', fact: '지연건수 5건 이상 또는 집행률 60% 미만은 위험' }],
  ['source-moe-work-plan-pdf', { locator: '2025년 교육부 주요업무 추진계획', fact: '기회의 사다리가 되는 공정한 교육 실현' }],
  ['source-requirements-docx', { locator: '인수 기준', fact: '저장 후 재열기와 구조·렌더 검증 필요' }],
  ['source-moe-preview-png', { locator: '공식 보도자료 미리보기', fact: '공식 이미지 증빙' }],
  ['source-moe-cover-jpg', { locator: 'HWPX 내장 표지 이미지', fact: '원본 패키지 이미지 증빙' }],
  ['source-large-legacy-hwp', { locator: '파일 크기 및 형식', fact: '약 10MB OLE 기반 레거시 HWP 참고자료' }],
]);

function sourceFactsFor(scenarioId, attachmentIds) {
  const facts = attachmentIds.flatMap((attachmentId) => {
    const sourceFact = sourceFactByAttachment.get(attachmentId);
    return sourceFact ? [{ attachmentId, ...sourceFact }] : [];
  });
  return facts.map((sourceFact, index) => ({
    factId: `${scenarioId}-F${String(index + 1).padStart(2, '0')}`,
    ...sourceFact,
  }));
}

function groundingText(sourceFact) {
  return `[${sourceFact.factId}] ${sourceFact.attachmentId} | ${sourceFact.locator} | ${String(sourceFact.fact)}`;
}

function groundingContract(scenarioId, sourceFacts, locations) {
  if (sourceFacts.length !== locations.length) {
    throw new Error(`${scenarioId} grounding locations must match source facts.`);
  }
  const expectedTargets = sourceFacts.map((sourceFact, index) => ({
    verificationId: `${scenarioId}-GROUND-${String(index + 1).padStart(2, '0')}`,
    factIds: [sourceFact.factId],
    location: locations[index],
    text: groundingText(sourceFact),
  }));
  return {
    factUsage: expectedTargets.map((target, index) => ({
      factId: sourceFacts[index].factId,
      expectedTargetId: target.verificationId,
      renderedText: target.text,
    })),
    expectedTargets,
  };
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

await initHwpxRuntime();
await fs.mkdir(goldRoot, { recursive: true });

const attachments = [];
for (const definition of attachmentDefinitions) {
  const absolute = path.join(sourceRoot, definition.filename);
  const bytes = await fs.readFile(absolute);
  const extension = path.extname(definition.filename).toLowerCase();
  attachments.push({
    id: definition.id,
    path: path.relative(datasetRoot, absolute).replaceAll('\\', '/'),
    mediaType: mediaTypes[extension] || 'application/octet-stream',
    sha256: sha256(bytes),
    byteLength: bytes.length,
    origin: definition.origin,
    license: definition.license,
    role: definition.role,
    ...(definition.notes ? { notes: definition.notes } : {}),
  });
}

const attachmentById = new Map(attachments.map((attachment) => [attachment.id, attachment]));
const beneficiariesAttachment = attachmentById.get('source-mpva-beneficiaries-xlsx');
const beneficiariesBytes = await fs.readFile(path.join(datasetRoot, beneficiariesAttachment.path));
const beneficiariesEvidence = await extractAttachmentEvidence(
  beneficiariesAttachment,
  beneficiariesBytes,
);
const beneficiariesRefCells = Object.entries(beneficiariesEvidence.cells)
  .filter(([, cell]) => cell.value === '#REF!' || cell.formula === '#REF!')
  .map(([locator]) => locator);
const beneficiariesRepresentativeCells = [
  '기본현황(경합형태별현황)!J7',
  '기본현황(경합형태별현황)!AA7',
];
if (!beneficiariesRepresentativeCells.every(locator => beneficiariesRefCells.includes(locator))) {
  throw new Error('Beneficiaries workbook no longer contains the expected representative #REF! cells.');
}
const beneficiariesRefFact = {
  attachmentId: beneficiariesAttachment.id,
  locator: '기본현황(경합형태별현황)!#REF!',
  fact: `#REF! 오류 ${beneficiariesRefCells.length}개; 대표 셀 J7, AA7`,
};
const briefingPath = path.join(sourceRoot, attachmentById.get('target-moe-briefing-hwpx').path.split('/').at(-1));
const briefing = new HwpxApiSession(await fs.readFile(briefingPath));
const briefingJson = briefing.readJson();
const paragraphTargets = briefingJson.sections
  .flatMap((section) => section.paragraphs)
  .filter((paragraph) => paragraph.text.trim().length >= 12 && paragraph.para < 67);
const cellTargets = briefingJson.tables
  .filter((table) => ['tbl_3', 'tbl_10', 'tbl_12'].includes(table.id))
  .flatMap((table) => table.cells)
  .filter((cell) => (cell.layout?.capacity?.recommendedChars ?? 0) >= 12);
const pngImage = briefingJson.objectGraph.images.find((image) => /\.png$/i.test(image.name));

if (paragraphTargets.length < 20 || cellTargets.length < 20 || !pngImage) {
  throw new Error('Official briefing fixture does not expose enough stable targets for 100 cases.');
}

const scenarios = [];
for (let index = 0; index < 90; index += 1) {
  const idNumber = index + 1;
  const id = `HWPX-PS-${String(idNumber).padStart(3, '0')}`;
  const [domain, policy] = domains[index % domains.length];
  const pattern = editPatterns[Math.floor(index / domains.length)];
  const paragraphA = paragraphTargets[(index * 3) % paragraphTargets.length];
  const paragraphB = paragraphTargets[(index * 3 + 7) % paragraphTargets.length];
  const cellA = cellTargets[(index * 5) % cellTargets.length];
  const cellB = cellTargets[(index * 5 + 11) % cellTargets.length];
  const label = `${domain} 검증 ${String(idNumber).padStart(3, '0')}`;
  const summaryText = `${label}: ${policy}`;
  const cellAText = `검증 ${idNumber}`;
  const cellBText = idNumber % 2 ? '재확인 필요' : '근거 일치';
  const selectedAttachments = [
    'target-moe-briefing-hwpx',
    ...pattern.attachments,
  ];
  const sourceFacts = sourceFactsFor(id, selectedAttachments);
  if (index >= 60 && index < 70) {
    sourceFacts.push({
      factId: `${id}-F${String(sourceFacts.length + 1).padStart(2, '0')}`,
      ...beneficiariesRefFact,
    });
  }
  const grounding = groundingContract(
    id,
    sourceFacts,
    sourceFacts.map((_, factIndex) => ({
      paragraph: {
        section: paragraphB.section,
        number: paragraphB.para + factIndex + 1,
      },
    })),
  );
  const commandTemplates = [
    {
      commandId: `${id}-paragraph`,
      op: 'text.replaceParagraph',
      location: { paragraph: { section: paragraphA.section, number: paragraphA.para } },
      text: summaryText,
    },
    {
      commandId: `${id}-insert`,
      op: 'text.insertAfterParagraph',
      location: { paragraph: { section: paragraphB.section, number: paragraphB.para } },
      text: grounding.expectedTargets.map(target => target.text).join('\n'),
    },
    {
      commandId: `${id}-cell-a`,
      op: 'table.writeCell',
      location: cellA.location,
      text: cellAText,
      fit: true,
      fitOptions: { maxLines: 2, truncate: false },
    },
    {
      commandId: `${id}-cell-b`,
      op: 'style.applyText',
      target: cellB.location,
      styleSource: cellA.location,
      text: cellBText,
    },
  ];
  if (index % 3 === 0) {
    commandTemplates.push({
      commandId: `${id}-image`,
      op: 'image.generateAndReplace',
      imageName: pngImage.name,
      generator: {
        width: 640,
        height: 360,
        background: '#ffffff',
        accent: ['#2f5fbd', '#0f766e', '#9b1c1c'][index % 3],
        values: [
          { value: 55 + (index % 20) },
          { value: 40 + (index % 15) },
          { value: 70 - (index % 10) },
        ],
      },
    });
  }
  const question = [
    `[${domain}] '${pattern.name}' 과업입니다.`,
    `${pattern.focus}`,
    `주 편집대상은 교육부 보도자료 HWPX이며, ${policy} 관점에서 첨부별 기준일·단위·오류·개인정보를 먼저 구분한 뒤 본문 2곳과 서로 다른 표 셀 2곳을 수정하십시오.`,
    '첨부에서 확인한 각 근거의 출처 위치와 실제 값을 검증 메모 문단에 빠짐없이 기록하십시오.',
    '쓰기 전 정확한 대상과 서식 원본을 조회하고 하나의 원자적 배치로 적용하며, 저장 후 다시 열어 지정 텍스트·표·그림·이미지·쪽수와 첫쪽/중간쪽/마지막쪽 렌더를 검증하십시오.',
    '근거가 충돌하면 임의 보정하지 말고 “재확인 필요”로 남기며, 구조 검사만 수행한 결과를 시각검수 완료로 보고하지 마십시오.',
  ].join(' ');
  const renderPages = [1, Math.ceil(briefingJson.pageCount / 2), briefingJson.pageCount];
  // In the pinned 11-page briefing fixture, paragraph 32 sits immediately
  // before a page-boundary layout segment. Inserting the four required
  // grounding paragraphs there deterministically adds two pages; all other
  // edit targets add at most one. Keep this target-specific so unrelated
  // scenarios still fail on a two-page layout regression.
  const maxPageCountDelta = paragraphB.section === 0 && paragraphB.para === 32 ? 2 : 1;
  const scenario = {
    id,
    version: '1.0.0',
    mode: 'edit',
    difficulty: 'expert',
    domain,
    title: `${domain} ${pattern.name} HWPX 복합 편집`,
    question,
    attachments: selectedAttachments,
    target: {
      attachmentId: 'target-moe-briefing-hwpx',
      outputFilename: `${id.toLowerCase()}-${domain}.hwpx`,
    },
    sourceFacts,
    factUsage: grounding.factUsage,
    requiredCapabilities: [
      'bounded-read-json',
      'target-inspect',
      'atomic-command-batch',
      'table-style-clone',
      'save-and-reopen',
      'baseline-render-compare',
      ...(index % 3 === 0 ? ['object-inventory', 'image-generate-and-replace'] : []),
    ],
    oracle: {
      commandTemplates,
      expectedTargets: [
        {
          verificationId: `${id}-CONTENT-01`,
          factIds: [],
          location: { paragraph: { section: paragraphA.section, number: paragraphA.para } },
          text: summaryText,
        },
        {
          verificationId: `${id}-CONTENT-02`,
          factIds: [],
          location: cellA.location,
          text: cellAText,
        },
        {
          verificationId: `${id}-CONTENT-03`,
          factIds: [],
          location: cellB.location,
          text: cellBText,
        },
        ...grounding.expectedTargets,
      ],
      invariants: {
        reopenRequired: true,
        maxPageCountDelta,
        preserveTableCount: true,
        preservePictureCount: true,
        preserveImageCount: true,
        noUnexpectedTargetChanges: true,
      },
      renderChecks: {
        pages: renderPages,
        requireNonBlank: true,
        compareBaseline: true,
      },
      score,
    },
    tags: [...new Set(['public-sector', 'hwpx', 'multi-attachment', 'expert', ...pattern.tags])],
  };
  scenarios.push(scenario);
}

for (let domainIndex = 0; domainIndex < domains.length; domainIndex += 1) {
  const idNumber = 91 + domainIndex;
  const id = `HWPX-PS-${String(idNumber).padStart(3, '0')}`;
  const [domain, policy] = domains[domainIndex];
  const sourceFacts = sourceFactsFor(id, [
    'source-mpva-veterans-xlsx',
    'source-mpva-beneficiaries-xlsx',
    'source-procurement-csv',
    'source-decisions-txt',
  ]).map((sourceFact, index) => {
    if (index === 2) {
      return { ...sourceFact, locator: 'SAFE-02 지연건수', fact: 6 };
    }
    if (index === 3) {
      return {
        ...sourceFact,
        locator: '결정사항 7',
        fact: '저장 후 재열기 및 3개 대표 페이지 렌더 비교',
      };
    }
    return sourceFact;
  });
  const lines = [
    `${domain} 복합근거 검토보고서`,
    `기준일: 2026-06-30`,
    `정책목표: ${policy}`,
    `수치검증: ${groundingText(sourceFacts[0])}; ${groundingText(sourceFacts[1])}`,
    `위험판정: ${groundingText(sourceFacts[2])}`,
    '개인정보: 직접 식별값은 결과에서 제외하고 마스킹 건수만 기록',
    `품질조건: ${groundingText(sourceFacts[3])}`,
    `결론: ${domain} 자료는 근거 일치 항목만 반영하고 충돌 항목은 재확인 필요`,
  ];
  const targetFactIds = [
    [],
    [],
    [],
    [sourceFacts[0].factId, sourceFacts[1].factId],
    [sourceFacts[2].factId],
    [],
    [sourceFacts[3].factId],
    [],
  ];
  const expectedTargets = lines.map((text, index) => ({
    verificationId: `${id}-CONTENT-${String(index + 1).padStart(2, '0')}`,
    factIds: targetFactIds[index],
    location: { paragraph: { section: 0, number: index + 1 } },
    text,
  }));
  const expectedTargetByFactId = new Map(
    expectedTargets.flatMap(target => target.factIds.map(factId => [factId, target])),
  );
  const factUsage = sourceFacts.map(sourceFact => {
    const target = expectedTargetByFactId.get(sourceFact.factId);
    return {
      factId: sourceFact.factId,
      expectedTargetId: target.verificationId,
      renderedText: target.text,
    };
  });
  const question = [
    `[${domain}] 신규 HWPX 생성 과업입니다.`,
    '빈 HWPX 템플릿을 시작점으로 사용하되 교육부 HWPX/PDF, 국가보훈부 XLSX 두 종, 예산 CSV, 회의결정 TXT, 인수요구 DOCX를 모두 근거로 읽고 제목·기준일·정책목표·수치검증·위험판정·개인정보 통제·품질조건·결론의 8개 문단을 순서대로 작성하십시오.',
    `핵심 정책은 '${policy}'이며, XLSX의 수식오류와 서로 다른 기준일을 숨기지 말고 충돌값은 “재확인 필요”로 표시해야 합니다.`,
    '각 source fact의 출처 위치와 실제 값을 해당 수치검증·위험판정·품질조건 문단에 명시하십시오.',
    '템플릿 원본은 덮어쓰지 말고 HWPX로 저장한 뒤 다시 열어 8개 문단의 정확한 순서와 텍스트, 1쪽 이내 결과, 비어 있지 않은 첫 페이지 렌더, 패키지 재열기 성공을 API만으로 검증하십시오.',
  ].join(' ');
  scenarios.push({
    id,
    version: '1.0.0',
    mode: 'generation',
    difficulty: 'expert',
    domain,
    title: `${domain} 8문단 복합근거 HWPX 생성`,
    question,
    attachments: [
      'target-blank-generation-hwpx',
      'target-moe-briefing-hwpx',
      'source-moe-work-plan-pdf',
      'source-mpva-veterans-xlsx',
      'source-mpva-beneficiaries-xlsx',
      'source-procurement-csv',
      'source-decisions-txt',
      'source-requirements-docx',
    ],
    target: {
      attachmentId: 'target-blank-generation-hwpx',
      outputFilename: `${id.toLowerCase()}-${domain}-generated.hwpx`,
    },
    sourceFacts,
    factUsage,
    requiredCapabilities: [
      'template-based-generation',
      'target-inspect',
      'atomic-command-batch',
      'save-and-reopen',
      'baseline-render-compare',
    ],
    oracle: {
      commandTemplates: [{
        commandId: `${id}-generate`,
        op: 'text.insertAfterParagraph',
        location: { paragraph: { section: 0, number: 0 } },
        text: lines.join('\n'),
      }],
      expectedTargets,
      invariants: {
        reopenRequired: true,
        maxPageCountDelta: 1,
        preserveTableCount: true,
        preservePictureCount: true,
        preserveImageCount: true,
        noUnexpectedTargetChanges: true,
      },
      renderChecks: {
        pages: [1],
        requireNonBlank: true,
        compareBaseline: true,
      },
      score,
    },
    tags: ['public-sector', 'hwpx', 'multi-attachment', 'expert', 'generation', 'template-based'],
  });
}

for (const scenario of scenarios) {
  if (scenario.question.length < 100 || scenario.question.length > 1000) {
    throw new Error(`${scenario.id} question length ${scenario.question.length} violates 100..1000.`);
  }
  if (!scenario.attachments.includes(scenario.target.attachmentId)) {
    throw new Error(`${scenario.id} target attachment is missing.`);
  }
  if (!scenario.attachments.every((id) => attachmentById.has(id))) {
    throw new Error(`${scenario.id} references an unknown attachment.`);
  }
  const formats = new Set(scenario.attachments.map((id) => path.extname(attachmentById.get(id).path)));
  if (!formats.has('.hwpx') || formats.size < 4) {
    throw new Error(`${scenario.id} must contain HWPX plus at least three other formats.`);
  }
  const gold = {
    scenarioId: scenario.id,
    answerContract: {
      summary: `Apply ${scenario.oracle.commandTemplates.length} exact HWPX command(s), then save, reopen, and verify structural plus rendered invariants.`,
      sourceFacts: scenario.sourceFacts,
      factUsage: scenario.factUsage,
      oracle: scenario.oracle,
      adjudication: {
        passThreshold: 85,
        hardFailureOverridesScore: true,
        visualReviewRequiredForFinalAcceptance: true,
        unsupportedClaims: [
          'A successful save alone is not visual proof.',
          'A structural reopen alone is not Hancom rendering proof.',
          'Visible hyphen text is not a native HWPX numbering object.',
        ],
      },
    },
  };
  await fs.writeFile(path.join(goldRoot, `${scenario.id}.json`), `${JSON.stringify(gold, null, 2)}\n`);
}

await fs.writeFile(
  path.join(datasetRoot, 'attachments.json'),
  `${JSON.stringify({ version: '1.0.0', generatedAt, attachmentCount: attachments.length, attachments }, null, 2)}\n`,
);
await fs.writeFile(
  path.join(datasetRoot, 'scenarios.jsonl'),
  `${scenarios.map((scenario) => JSON.stringify(scenario)).join('\n')}\n`,
);
await fs.writeFile(
  path.join(datasetRoot, 'manifest.json'),
  `${JSON.stringify({
    version: '1.0.0',
    generatedAt,
    scenarioCount: scenarios.length,
    editCount: scenarios.filter((scenario) => scenario.mode === 'edit').length,
    generationCount: scenarios.filter((scenario) => scenario.mode === 'generation').length,
    minQuestionLength: Math.min(...scenarios.map((scenario) => scenario.question.length)),
    maxQuestionLength: Math.max(...scenarios.map((scenario) => scenario.question.length)),
    domains: [...new Set(scenarios.map((scenario) => scenario.domain))],
    sourceFormats: [...new Set(attachments.map((attachment) => path.extname(attachment.path).slice(1)))].sort(),
    attachmentCount: attachments.length,
    encryptedPackageAudit: {
      attachmentId: 'adversarial-encrypted-moe-hwpx',
      expectedErrorCode: 'unsupported_encrypted_hwpx',
    },
    files: {
      attachments: 'attachments.json',
      scenarios: 'scenarios.jsonl',
      scenarioSchema: 'schema/scenario.schema.json',
      attachmentSchema: 'schema/attachment.schema.json',
      goldDirectory: 'gold',
    },
  }, null, 2)}\n`,
);

console.log(JSON.stringify({
  scenarios: scenarios.length,
  edit: scenarios.filter((scenario) => scenario.mode === 'edit').length,
  generation: scenarios.filter((scenario) => scenario.mode === 'generation').length,
  attachments: attachments.length,
  minQuestionLength: Math.min(...scenarios.map((scenario) => scenario.question.length)),
  maxQuestionLength: Math.max(...scenarios.map((scenario) => scenario.question.length)),
}));
