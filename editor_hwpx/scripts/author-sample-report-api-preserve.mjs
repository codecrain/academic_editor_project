import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HwpxApiSession, initHwpxRuntime } from './hwpx-api-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(repoRoot, 'output', 'hwpx-review', 'sample-report-api-preserve');

const inputPath =
  process.argv[2] ??
  'C:/CC/tlooto_onpremise_project/server2/generated/document_editor_api_samples/sample-input.hwpx';
const outputPath = process.argv[3] ?? path.join(outDir, 'sample-input.api-preserve-authored.hwpx');
const readJsonPath = outputPath.replace(/\.hwpx$/i, '.api-read.json');
const reportPath = outputPath.replace(/\.hwpx$/i, '.api-report.json');

const municipality = '청명시';
const reportTitle = '2025년 고향사랑기부제 실적 분석보고서';

const summaryText = [
  '· 2025년 총 기부액은 1,284백만원, 기부 건수는 18,420건으로 전년 대비 각각 23.4%, 18.7% 증가하였다.',
  '· 12월과 18~22시 구간에 기부가 집중되어 연말 세액공제 수요와 모바일 접근성이 성과를 견인하였다.',
  '· 10만원 이하 소액 기부가 건수의 82.5%를 차지하나, 30만원 이상 기부자가 금액의 41.2%를 부담하였다.',
  '· 답례품은 지역 농식품 3종이 전체 선택의 57.8%를 차지해 재고·배송 품질 관리가 핵심 운영 과제이다.',
  '· 2026년에는 연말 집중 완화, 고액 기부자 사후관리, 답례품 포트폴리오 재정비가 우선 추진 과제이다.',
].join('\n');

const preface = [
  '본 보고서는 청명시의 2025년 고향사랑기부제 운영 결과를 기부 건수, 기부 금액, 시간대, 요일, 금액 구간, 답례품 선택 흐름으로 나누어 분석한 자료입니다.',
  '수치는 내부 결산 기준으로 정리했으며, 정책 판단에 필요한 추세와 병목 요인을 중심으로 해석했습니다.',
  '운영 부서는 본 보고서를 2026년 홍보 일정, 답례품 계약, 민원 대응, 고액 기부자 사후관리 계획 수립에 활용해 주시기 바랍니다.',
].join('\n');

const kpiCells = [
  '1. 기부통계\n핵심 지표',
  '구분', '2025년 실적',
  '총 기부 건수', '18,420건',
  '총 기부 금액', '1,284백만원',
  '평균 기부액', '69,707원',
];

const totalCells = [
  '기부 실적', '답례품·증감',
  '기부자', '건수', '금액', '비중', '답례품', '선택률', '전년비', '판정',
  '전체', '18,420', '1,284백만', '100%', '13,338', '72.4%', '+23.4%', '우수',
];

const monthRows = [
  ['월', '건수', '금액', '전년비', '답례품', '해석'],
  ['1월', '840', '54백만', '+6%', '620', '연초 문의 기반'],
  ['3월', '1,120', '72백만', '+9%', '810', '홍보 안정'],
  ['6월', '1,360', '91백만', '+14%', '990', '상반기 캠페인'],
  ['9월', '1,520', '104백만', '+19%', '1,105', '추석 수요'],
  ['11월', '2,480', '178백만', '+31%', '1,840', '세액공제 관심'],
  ['12월', '5,920', '438백만', '+44%', '4,350', '연말 집중'],
];

const weekdayCells = [
  '요일', '기부 건수', '기부 금액', '건수', '비중', '금액', '평균액',
  '월', '2,410', '13.1%', '158백만', '65,560원',
  '화', '2,620', '14.2%', '174백만', '66,412원',
  '수', '2,760', '15.0%', '188백만', '68,116원',
  '목', '2,890', '15.7%', '203백만', '70,242원',
  '금', '3,140', '17.0%', '224백만', '71,338원',
  '토', '2,280', '12.4%', '165백만', '72,368원',
  '일', '2,320', '12.6%', '172백만', '74,138원',
  '합계', '18,420', '100%', '1,284백만', '69,707원',
];

const timeCells = [
  '0~5시', '6~11시', '12~17시', '18~23시',
  '건수', '비중', '건수', '비중', '건수', '비중', '건수', '비중',
  '410', '2.2%', '3,820', '20.7%', '5,930', '32.2%', '8,260', '44.9%',
  '전년비', '+8%', ' ', '+15%', ' ', '+18%', ' ', '+28%',
  '운영', '자동안내', ' ', '콜센터', ' ', 'SNS', ' ', '앱푸시',
  '리스크', '낮음', ' ', '문의대기', ' ', '결제지연', ' ', '폭주가능',
  '대응', '예약발송', ' ', '상담배치', ' ', '서버감시', ' ', '인력보강',
  '판정', '유지', ' ', '보강', ' ', '개선', ' ', '우선관리',
  '종합', '18~23시 집중 관리',
];

const amountCountRows = [
  ['금액 구간', '기부 건수', '비중'],
  ['1만원 이하', '2,940', '16.0%'],
  ['1만~3만원', '3,620', '19.7%'],
  ['3만~5만원', '3,980', '21.6%'],
  ['5만~10만원', '4,640', '25.2%'],
  ['10만~20만원', '1,620', '8.8%'],
  ['20만~30만원', '780', '4.2%'],
  ['30만~50만원', '460', '2.5%'],
  ['50만원 초과', '210', '1.1%'],
  ['정기 재기부', '170', '0.9%'],
  ['합계', '18,420', '100.0%'],
  ['시사점', '소액 기반 확대', '고액 관리 필요'],
];

const contributionRows = [
  ['금액 구간', '기부 금액', '기여도'],
  ['1만원 이하', '19백만', '1.5%'],
  ['1만~3만원', '82백만', '6.4%'],
  ['3만~5만원', '166백만', '12.9%'],
  ['5만~10만원', '353백만', '27.5%'],
  ['10만~20만원', '237백만', '18.5%'],
  ['20만~30만원', '184백만', '14.3%'],
  ['30만~50만원', '149백만', '11.6%'],
  ['50만원 초과', '86백만', '6.7%'],
  ['정기 재기부', '8백만', '0.6%'],
  ['합계', '1,284백만', '100.0%'],
  ['판정', '중액 이상 51.7%', '사후관리 핵심'],
];

const notes = {
  total: '종합 해석: 청명시는 연말 집중형 성장이 뚜렷하다. 단기 성과는 우수하지만 12월 의존도가 높아 2026년에는 3·6·9월 분산 캠페인을 운영해야 한다.',
  monthly: '월별 해석: 11~12월이 전체 금액의 48.0%를 차지한다. 조기 홍보를 강화하지 않으면 상담, 결제, 답례품 배송이 연말에 동시에 몰릴 수 있다.',
  weekday: '요일별 해석: 금~일 평균 기부액이 높다. 주말 모바일 유입을 놓치지 않도록 자동 안내, FAQ, 결제 오류 대응 체계를 사전에 준비한다.',
  time: '시간대 해석: 18~23시가 전체 건수의 44.9%이다. 퇴근 후 모바일 결제 흐름에 맞춰 앱 푸시와 간편결제 안내를 집중 배치한다.',
  amountCount: '금액 구간 해석: 10만원 이하가 건수의 대부분을 구성한다. 접근성은 유지하되, 중·고액 기부자에게는 사용처 보고와 감사 메시지를 별도로 제공한다.',
  contribution: '기여도 해석: 20만원 이상 기부자는 건수는 작지만 금액 기여도가 높다. 고액 기부자의 재기부율을 추적하는 별도 관리 지표가 필요하다.',
  final: '최종 제언: 2026년 운영 목표는 연말 집중 완화, 답례품 배송 안정화, 중·고액 기부자 사후관리, 데이터 기반 홍보 일정 정교화로 설정한다.',
};

function tableById(json, id) {
  const table = json.tables.find((item) => item.id === id);
  assert.ok(table, `table not found: ${id}`);
  return table;
}

function normalizeReadableText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function writeFileWithFallback(preferredPath, data) {
  try {
    writeFileSync(preferredPath, data);
    return { path: preferredPath, fallback: false, reason: null };
  } catch (error) {
    if (!['EBUSY', 'EACCES', 'EPERM'].includes(error?.code)) {
      throw error;
    }
    const fallbackPath = preferredPath.replace(/(\.[^.]+)$/i, `.fallback-${Date.now()}$1`);
    writeFileSync(fallbackPath, data);
    return { path: fallbackPath, fallback: true, reason: error.code, preferredPath };
  }
}

function cellOp(opId, table, row, col, text, options = {}) {
  return {
    commandId: opId,
    op: 'table.writeCell',
    location: { tableId: table.id, cell: { row, column: col } },
    text,
    ...options,
  };
}

function cellIndexOp(opId, table, cellIndex, text, options = {}) {
  return {
    commandId: opId,
    op: 'table.writeCell',
    location: { tableId: table.id, cell: { number: cellIndex } },
    text,
    ...options,
  };
}

function paragraphOp(opId, paragraph, text) {
  return {
    commandId: opId,
    op: 'text.replaceParagraph',
    location: { paragraph: { section: 0, number: paragraph } },
    text,
  };
}

function styleCloneOp(opId, sourceTable, sourceCellIndex, targetTable, targetCellIndex) {
  return {
    commandId: opId,
    op: 'paragraph.applyStyle',
    source: { tableId: sourceTable.id, cell: { number: sourceCellIndex } },
    target: { tableId: targetTable.id, cell: { number: targetCellIndex } },
  };
}

function cellStyleCloneOp(opId, sourceTable, sourceCellIndex, targetTable, targetCellIndex) {
  return {
    commandId: opId,
    op: 'table.applyCellStyle',
    source: { tableId: sourceTable.id, cell: { number: sourceCellIndex } },
    target: { tableId: targetTable.id, cell: { number: targetCellIndex } },
  };
}

function addCellIndexOps(ops, prefix, table, values) {
  assert.equal(values.length, table.cells.length, `${prefix} value count must match ${table.id} cell count`);
  values.forEach((text, cellIndex) => {
    ops.push(cellIndexOp(`${prefix}-${cellIndex}`, table, cellIndex, text));
  });
}

await initHwpxRuntime();
mkdirSync(outDir, { recursive: true });

const inputBytes = readFileSync(inputPath);
const session = new HwpxApiSession(inputBytes);
const before = session.readJson();
writeFileSync(readJsonPath, JSON.stringify(before, null, 2));

const tables = Object.fromEntries(before.tables.map((table) => [table.id, table]));
const ops = [
  paragraphOp('cover-municipality', 5, municipality),
  paragraphOp('cover-title', 6, reportTitle),
  paragraphOp('cover-date', 18, '2026. 1.'),
  paragraphOp('section-1-1', 27, '(1) 총괄 기부 실적'),
  paragraphOp('section-1-2', 35, '(2) 월별 기부 건수 및 금액'),
  paragraphOp('section-1-3', 42, '(3) 요일별 기부 건수 및 기부 금액'),
  paragraphOp('section-1-4', 49, '(4) 시간대별 기부 건수'),
  paragraphOp('section-1-5', 56, '(5) 기부 금액별 기부 건수'),
  paragraphOp('section-1-6', 77, '(6) 기부 금액별 기여도(총기부 금액 대비 각 비중)'),
  cellOp('preface', tables.tbl_0, 0, 0, preface, { fit: true, fitOptions: { maxCharsPerLine: 68, truncate: false } }),
  cellOp('summary-title', tables.tbl_1, 0, 1, '< 2025년 기부·답례품 실적 분석보고서 요약 >'),
  {
    commandId: 'summary-body',
    op: 'list.writeBullets',
    location: { tableId: tables.tbl_1.id, cell: { row: 2, column: 0 } },
    marker: '·',
    items: summaryText.split('\n').map((line) => line.replace(/^·\s*/, '')),
    fit: true,
    fitOptions: { maxCharsPerLine: 78, truncate: false },
  },
  cellOp('kpi-title', tables.tbl_2, 0, 0, '핵심 지표'),
  cellOp('total-note-title', tables.tbl_4, 0, 0, '분석 의견'),
  cellOp('total-note', tables.tbl_4, 1, 0, notes.total, { fit: true, fitOptions: { maxCharsPerLine: 70, truncate: false } }),
  cellOp('monthly-note-title', tables.tbl_6, 0, 0, '분석 의견'),
  cellOp('monthly-note', tables.tbl_6, 1, 0, notes.monthly, { fit: true, fitOptions: { maxCharsPerLine: 70, truncate: false } }),
  cellOp('weekday-note-title', tables.tbl_8, 0, 0, '분석 의견'),
  cellOp('weekday-note', tables.tbl_8, 1, 0, notes.weekday, { fit: true, fitOptions: { maxCharsPerLine: 70, truncate: false } }),
  cellOp('time-note-title', tables.tbl_10, 0, 0, '분석 의견'),
  cellOp('time-note', tables.tbl_10, 1, 0, notes.time, { fit: true, fitOptions: { maxCharsPerLine: 70, truncate: false } }),
  cellOp('amount-note-title', tables.tbl_12, 0, 0, '분석 의견'),
  cellOp('amount-note', tables.tbl_12, 1, 0, notes.amountCount, { fit: true, fitOptions: { maxCharsPerLine: 70, truncate: false } }),
  cellOp('contribution-note-title', tables.tbl_14, 0, 0, '최종 제언'),
  cellOp('contribution-note', tables.tbl_14, 1, 0, notes.final, { fit: true, fitOptions: { maxCharsPerLine: 70, truncate: false } }),
  styleCloneOp('monthly-note-title-style', tables.tbl_4, 0, tables.tbl_6, 0),
  styleCloneOp('weekday-note-title-style', tables.tbl_4, 0, tables.tbl_8, 0),
  styleCloneOp('time-note-title-style', tables.tbl_4, 0, tables.tbl_10, 0),
  styleCloneOp('amount-note-title-style', tables.tbl_4, 0, tables.tbl_12, 0),
  styleCloneOp('contribution-note-title-style', tables.tbl_4, 0, tables.tbl_14, 0),
  styleCloneOp('monthly-note-body-style', tables.tbl_4, 1, tables.tbl_6, 1),
  styleCloneOp('weekday-note-body-style', tables.tbl_4, 1, tables.tbl_8, 1),
  styleCloneOp('time-note-body-style', tables.tbl_4, 1, tables.tbl_10, 1),
  styleCloneOp('amount-note-body-style', tables.tbl_4, 1, tables.tbl_12, 1),
  styleCloneOp('contribution-note-body-style', tables.tbl_4, 1, tables.tbl_14, 1),
  cellStyleCloneOp('monthly-note-title-cell-style', tables.tbl_4, 0, tables.tbl_6, 0),
  cellStyleCloneOp('weekday-note-title-cell-style', tables.tbl_4, 0, tables.tbl_8, 0),
  cellStyleCloneOp('time-note-title-cell-style', tables.tbl_4, 0, tables.tbl_10, 0),
  cellStyleCloneOp('amount-note-title-cell-style', tables.tbl_4, 0, tables.tbl_12, 0),
  cellStyleCloneOp('contribution-note-title-cell-style', tables.tbl_4, 0, tables.tbl_14, 0),
  cellStyleCloneOp('monthly-note-body-cell-style', tables.tbl_4, 1, tables.tbl_6, 1),
  cellStyleCloneOp('weekday-note-body-cell-style', tables.tbl_4, 1, tables.tbl_8, 1),
  cellStyleCloneOp('time-note-body-cell-style', tables.tbl_4, 1, tables.tbl_10, 1),
  cellStyleCloneOp('amount-note-body-cell-style', tables.tbl_4, 1, tables.tbl_12, 1),
  cellStyleCloneOp('contribution-note-body-cell-style', tables.tbl_4, 1, tables.tbl_14, 1),
];

addCellIndexOps(ops, 'kpi', tables.tbl_2, kpiCells);
addCellIndexOps(ops, 'total', tables.tbl_3, totalCells);
addCellIndexOps(ops, 'monthly', tables.tbl_5, monthRows.flat());
addCellIndexOps(ops, 'weekday', tables.tbl_7, weekdayCells);
addCellIndexOps(ops, 'time', tables.tbl_9, timeCells);
addCellIndexOps(ops, 'amount-count', tables.tbl_11, amountCountRows.flat());
addCellIndexOps(ops, 'contribution', tables.tbl_13, contributionRows.flat());

const batch = session.apply(ops);
const saved = session.save();
const outputWrite = writeFileWithFallback(outputPath, saved.bytes);
const actualOutputPath = outputWrite.path;

const reopened = new HwpxApiSession(saved.bytes);
const after = reopened.readJson();

assert.equal(after.blocks.find((block) => block.native.paragraph === 5).text, municipality);
assert.equal(after.blocks.find((block) => block.native.paragraph === 6).text, reportTitle);
assert.equal(normalizeReadableText(tableById(after, 'tbl_0').cells[0].text), normalizeReadableText(preface));
assert.equal(normalizeReadableText(tableById(after, 'tbl_1').cells.find((cell) => cell.cellIndex === 5).text), normalizeReadableText(summaryText));
assert.equal(tableById(after, 'tbl_2').cells.find((cell) => cell.cellIndex === 0).text, '1. 기부통계\n핵심 지표');
assert.equal(tableById(after, 'tbl_2').cells.find((cell) => cell.cellIndex === 3).text, '총 기부 건수');
assert.equal(tableById(after, 'tbl_2').cells.find((cell) => cell.cellIndex === 4).text, '18,420건');
assert.equal(tableById(after, 'tbl_11').cells.find((cell) => cell.row === 10 && cell.col === 0).text, '합계');
assert.equal(tableById(after, 'tbl_13').cells.find((cell) => cell.row === 10 && cell.col === 1).text, '1,284백만');
assert.equal(saved.validation.pageCount, before.pageCount);
assert.equal(saved.validation.tables.length, before.tables.length);

const report = {
  ok: true,
  method: 'HwpxApiSession readJson -> apply(text.replaceParagraph,table.writeCell,list.writeBullets,paragraph.applyStyle,table.applyCellStyle) -> preserve-package save',
  inputPath,
  outputPath: actualOutputPath,
  requestedOutputPath: outputPath,
  outputWrite,
  readJsonPath,
  before: {
    pageCount: before.pageCount,
    paragraphCount: before.sections[0].paragraphCount,
    tableCount: before.tables.length,
  },
  batch: {
    revision: batch.revision,
    commandCount: batch.results.length,
    failed: batch.results.filter((result) => !result.ok),
  },
  quality: reopened.qualityCheck({ baselineJson: before }),
  after: {
    pageCount: after.pageCount,
    paragraphCount: after.sections[0].paragraphCount,
    tableCount: after.tables.length,
    validation: saved.validation,
    checkedValues: {
      municipality: after.blocks.find((block) => block.native.paragraph === 5).text,
      title: after.blocks.find((block) => block.native.paragraph === 6).text,
      totalAmount: tableById(after, 'tbl_13').cells.find((cell) => cell.row === 10 && cell.col === 1).text,
      finalNote: tableById(after, 'tbl_14').cells.find((cell) => cell.row === 1 && cell.col === 0).text,
    },
  },
};

const actualReportPath = actualOutputPath.replace(/\.hwpx$/i, '.api-report.json');
writeFileWithFallback(actualReportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
