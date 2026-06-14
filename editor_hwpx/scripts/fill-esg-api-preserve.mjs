import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HwpxApiSession, initHwpxRuntime } from './hwpx-api-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(repoRoot, 'output', 'hwpx-review', 'api-preserve');

const inputPath = process.argv[2] ?? path.join(repoRoot, 'output', 'hwpx-review', '01-esg-original.hwpx');
const outputPath = process.argv[3] ?? path.join(outDir, '01-esg-original.api-preserve-filled.hwpx');
const readJsonPath = outputPath.replace(/\.hwpx$/i, '.api-read.json');
const reportPath = outputPath.replace(/\.hwpx$/i, '.api-report.json');

const content = {
  receiptNo: 'ESG-I-2025-01',
  department: '디지털혁신팀',
  owner: '김서연 책임매니저',
  category: '☑ I(혁신)  ☑ E(환경)/G(지배구조)  □ S(안전)  ☑ S(사회)',
  title: 'HWPX 기반 AI 업무비서로 ESG 공모 문서 작성·검증 자동화',
  improvements: [
    '· 공모·보고 문서를 HWPX 원본 서식 안에서 작성, 검토, 저장까지 한 흐름으로 통합',
    '· 반복 입력 항목은 API가 표 셀을 식별해 자동 채움으로써 누락과 오기입을 예방',
    '· 제출 전 필수 항목, 분량, 표절 위험, 개인정보 포함 여부를 체크리스트로 점검',
    '· 문서 이력과 검증 로그를 남겨 담당자 교체 시에도 근거와 최종본 추적 가능',
    '· 출력·스캔·재입력 절차를 줄여 종이 사용과 문서 처리 시간을 동시에 절감',
  ].join('\n'),
  summary: [
    '· 추진배경: ESG·혁신경영 공모 문서는 한글 서식 의존도가 높아 작성자별 편차가 컸음',
    '· 문제점: 빈 칸, 필수 항목 누락, 버전 혼선, 최종본 확인 지연이 반복되어 행정 부담이 증가',
    '· 개선내용: HWPX 문서를 API로 읽고 표 셀 단위로 수정하여 기존 양식과 페이지 구성을 보존',
    '· 개선내용: AI 초안, 담당자 수정, 검증, 저장 결과를 하나의 편집 세션에서 관리',
    '· 운영방식: 작성자는 웹 편집기에서 내용만 보완하고 관리자는 API 보고서로 변경 범위를 확인',
    '· 정량효과: 문서 1건당 초안 작성 시간을 약 60분에서 35분 수준으로 단축 가능',
    '· 정성효과: 제출 품질이 담당자 숙련도보다 표준 절차와 검증 기준에 의해 관리됨',
    '· 확산계획: 결과보고서, 회의록, 공문 초안, 대외 공모 서식으로 동일 체계 확대',
  ].join('\n'),
  effects: [
    '· 인쇄·스캔·재입력 감소로 종이와 사무 소모품 사용량 절감',
    '· 제출 전 자동 검증으로 반려와 재제출 위험 감소',
    '· HWPX 원본 양식을 유지해 부서 간 문서 품질 편차 완화',
    '· 변경 이력 기반 검토로 내부 감사와 대외 설명 가능성 강화',
    '· 동일 API를 다른 정형 서식에 재사용해 행정 자동화 기반 확보',
  ].join('\n'),
  awards: [
    '· 2025년 사내 혁신 우수사례 후보 추천 예정',
    '· 대외 ESG·디지털 행정혁신 경진대회 제출 가능',
  ].join('\n'),
  detail: [
    '1. 추진배경',
    '· ESG·혁신경영 공모와 결과보고는 대부분 정해진 HWPX 양식으로 접수된다.',
    '· 담당자는 기존 문서를 복사해 수정하지만 표 셀 위치와 문단 서식이 쉽게 흐트러진다.',
    '· 최종본 확인이 사람의 육안 검토에 의존해 누락, 오탈자, 개인정보 포함 위험이 남는다.',
    '',
    '2. 문제 진단',
    '· 작성자는 내용보다 양식 맞춤과 버전 정리에 많은 시간을 사용한다.',
    '· 관리자는 여러 부서의 파일을 모아 동일 기준으로 비교하기 어렵다.',
    '· 제출 직전 발견되는 누락은 일정 지연과 재작업을 만든다.',
    '',
    '3. 개선 실행',
    '· HWPX 문서를 API로 열고 표, 셀, 문단, 페이지 정보를 JSON으로 구조화한다.',
    '· AI가 초안을 만들면 API 명령이 지정된 셀에만 내용을 입력해 원본 양식을 보존한다.',
    '· 저장 후 다시 열어 페이지 수, 표 개수, 주요 셀 값, 검증 경고를 확인한다.',
    '· 담당자는 웹 편집기에서 결과를 보고 필요한 표현만 직접 다듬는다.',
    '',
    '4. 기대효과',
    '· 문서 초안 작성 시간은 약 40% 단축되고, 검토자는 내용 판단에 집중할 수 있다.',
    '· 원본 서식을 깨지 않는 저장 방식으로 한글 기반 제출 관행과 충돌하지 않는다.',
    '· 검증 로그가 남아 내부 감사, 대외 설명, 후속 보고서 작성에 활용된다.',
    '',
    '5. 확산계획',
    '· 1차로 ESG 공모 신청서와 결과보고서에 적용한다.',
    '· 2차로 회의록, 업무보고, 보도자료 초안, 공문 붙임 서식으로 확장한다.',
    '· 장기적으로는 부서별 성과지표와 문서 템플릿을 연결해 자동 작성 품질을 높인다.',
  ].join('\n'),
};

function byDims(tables, rowCount, colCount, occurrence = 1) {
  const matches = tables.filter((table) => table.dims.rowCount === rowCount && table.dims.colCount === colCount);
  const table = matches[occurrence - 1];
  assert.ok(table, `table not found: ${rowCount}x${colCount} occurrence ${occurrence}`);
  return table;
}

function cellOp(opId, table, cellIndex, text) {
  return {
    commandId: opId,
    op: 'table.writeCell',
    location: { tableId: table.id, cell: { number: cellIndex } },
    text,
  };
}

await initHwpxRuntime();
mkdirSync(outDir, { recursive: true });

const inputBytes = readFileSync(inputPath);
const session = new HwpxApiSession(inputBytes);
const before = session.readJson();
writeFileSync(readJsonPath, JSON.stringify(before, null, 2));

const summaryTitle = byDims(before.tables, 1, 3, 1);
const summary = byDims(before.tables, 9, 5, 1);
const detailTitle = byDims(before.tables, 1, 3, 2);
const detail = byDims(before.tables, 6, 5, 1);

const ops = [
  cellOp('summary-title', summaryTitle, 2, ' 작성 양식[요약]-API 작성본'),
  cellOp('detail-title', detailTitle, 2, ' 작성 양식[상세]-API 작성본'),
  cellOp('summary-receipt', summary, 1, content.receiptNo),
  cellOp('summary-department', summary, 3, content.department),
  cellOp('summary-owner', summary, 5, content.owner),
  cellOp('summary-category', summary, 7, content.category),
  cellOp('summary-main-title', summary, 10, content.title),
  cellOp('summary-improvements', summary, 12, content.improvements),
  cellOp('summary-body', summary, 14, content.summary),
  cellOp('summary-effects', summary, 16, content.effects),
  cellOp('summary-awards', summary, 18, content.awards),
  cellOp('detail-receipt', detail, 1, content.receiptNo),
  cellOp('detail-department', detail, 3, content.department),
  cellOp('detail-owner', detail, 5, content.owner),
  cellOp('detail-category', detail, 7, content.category),
  cellOp('detail-main-title', detail, 10, content.title),
  cellOp('detail-body', detail, 12, content.detail),
];

const batch = session.apply(ops);
const saved = session.save();
writeFileSync(outputPath, saved.bytes);

const reopened = new HwpxApiSession(saved.bytes);
const after = reopened.readJson();
const afterSummary = after.tables.find((table) => table.id === summary.id);
const afterDetail = after.tables.find((table) => table.id === detail.id);

const value = (table, cellIndex) => table.cells.find((cell) => cell.cellIndex === cellIndex).text;
assert.equal(value(afterSummary, 1), content.receiptNo);
assert.equal(value(afterSummary, 3), content.department);
assert.equal(value(afterSummary, 5), content.owner);
assert.equal(value(afterSummary, 7), content.category);
assert.equal(value(afterSummary, 10), content.title);
assert.equal(value(afterSummary, 12), content.improvements);
assert.equal(value(afterSummary, 14), content.summary);
assert.equal(value(afterSummary, 16), content.effects);
assert.equal(value(afterSummary, 18), content.awards);
assert.equal(value(afterDetail, 12), content.detail);
assert.equal(saved.validation.pageCount, before.pageCount);

const report = {
  ok: true,
  method: 'HwpxApiSession readJson -> apply(table.writeCell) -> preserve-package save',
  inputPath,
  outputPath,
  readJsonPath,
  before: {
    pageCount: before.pageCount,
    tables: before.tables.map((table) => ({ id: table.id, dims: table.dims, native: table.native })),
  },
  batch,
  quality: reopened.qualityCheck({ baselineJson: before }),
  after: {
    pageCount: after.pageCount,
    validation: saved.validation,
    summary: {
      receiptNo: value(afterSummary, 1),
      department: value(afterSummary, 3),
      owner: value(afterSummary, 5),
      title: value(afterSummary, 10),
    },
    detailLength: value(afterDetail, 12).length,
  },
};

writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
