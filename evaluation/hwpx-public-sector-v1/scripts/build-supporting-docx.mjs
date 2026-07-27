import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const outputPath = path.resolve(
  process.argv[2]
    || 'evaluation/hwpx-public-sector-v1/attachments/source/public-procurement-requirements.docx',
);

const colors = {
  navy: '1F4D78',
  blue: '2E74B5',
  gray: 'F2F4F7',
  border: 'C9D1D9',
  muted: '586069',
  white: 'FFFFFF',
};

const border = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: colors.border,
};

const cell = (text, width, options = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA },
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  shading: options.header
    ? { type: ShadingType.CLEAR, color: 'auto', fill: colors.gray }
    : undefined,
  borders: { top: border, bottom: border, left: border, right: border },
  children: [
    new Paragraph({
      alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: 280 },
      children: [new TextRun({ text, bold: options.header, size: 20, font: 'Malgun Gothic' })],
    }),
  ],
});

const requirementRows = [
  ['R-01', '원본 HWPX의 쪽수·표·그림 개수를 저장 전후 비교하고 삭제 또는 이동을 탐지한다.', '필수', '구조'],
  ['R-02', '본문·표 셀 수정은 정확한 대상 위치를 먼저 조회한 뒤 현재 리비전에서만 수행한다.', '필수', 'API'],
  ['R-03', '최종 저장물은 다시 열어 대상 텍스트와 패키지 관계 파일이 유효한지 확인한다.', '필수', '재열기'],
  ['R-04', '첫쪽·중간쪽·마지막쪽을 원본과 렌더 비교하며 비어 있는 페이지를 허용하지 않는다.', '필수', '시각'],
  ['R-05', '개인식별정보는 결과 HWPX에 기록하지 않고 마스킹 건수만 검증 메모에 남긴다.', '필수', '보안'],
  ['R-06', '금액은 원 단위 근거값과 백만원 단위 표시값을 모두 추적할 수 있어야 한다.', '필수', '정확성'],
  ['R-07', '목록 번호 체계와 표 셀 스타일은 원본 정의를 복제하며 임의 문자 서식을 최소화한다.', '권고', '서식'],
  ['R-08', '실패한 배치는 앞선 명령까지 포함하여 전부 롤백하고 리비전을 증가시키지 않는다.', '필수', '원자성'],
];

const riskRows = [
  ['개인정보 노출', '첨부 통계의 전화번호·전자우편이 본문으로 전사됨', '즉시 차단', '마스킹 후 재검수'],
  ['합계 불일치', 'CSV·XLSX의 기준일 또는 집계 범위가 다름', '재확인 필요', '근거값과 차이를 병기'],
  ['레이아웃 밀림', '장문 삽입으로 표·그림이 다음 쪽으로 이동', '1쪽 이내 조건부', 'fit 또는 문장 축약'],
  ['객체 손실', '이미지 교체 시 관계·콘텐츠 형식 항목이 누락', '허용 불가', '패키지 관계 재검증'],
  ['부분 저장', '배치 후반 오류인데 앞선 셀만 변경됨', '허용 불가', '원자 트랜잭션 강제'],
];

const makeTable = (headers, rows, widths) => new Table({
  width: { size: 9360, type: WidthType.DXA },
  layout: TableLayoutType.FIXED,
  columnWidths: widths,
  rows: [
    new TableRow({
      tableHeader: true,
      children: headers.map((header, index) => cell(header, widths[index], { header: true, center: true })),
    }),
    ...rows.map((row) => new TableRow({
      children: row.map((value, index) => cell(String(value), widths[index], { center: index === 0 || index >= 2 })),
    })),
  ],
});

const bullet = (text) => new Paragraph({
  numbering: { reference: 'public-sector-bullets', level: 0 },
  spacing: { before: 0, after: 80, line: 280 },
  children: [new TextRun({ text, size: 22, font: 'Malgun Gothic' })],
});

const doc = new Document({
  numbering: {
    config: [{
      reference: 'public-sector-bullets',
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: '•',
        alignment: AlignmentType.LEFT,
        style: {
          paragraph: { indent: { left: 720, hanging: 360 }, spacing: { after: 80, line: 280 } },
        },
      }],
    }],
  },
  styles: {
    default: {
      document: {
        run: { font: 'Malgun Gothic', size: 22, color: '111111' },
        paragraph: { spacing: { after: 120, line: 280 } },
      },
    },
    paragraphStyles: [
      {
        id: 'Title',
        name: 'Title',
        basedOn: 'Normal',
        run: { font: 'Malgun Gothic', size: 46, bold: true, color: colors.navy },
        paragraph: { spacing: { before: 0, after: 80 } },
      },
      {
        id: 'Subtitle',
        name: 'Subtitle',
        basedOn: 'Normal',
        run: { font: 'Malgun Gothic', size: 28, color: colors.muted },
        paragraph: { spacing: { before: 0, after: 320 } },
      },
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Malgun Gothic', size: 32, bold: true, color: colors.blue },
        paragraph: { spacing: { before: 320, after: 160 }, keepNext: true, outlineLevel: 0 },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Malgun Gothic', size: 26, bold: true, color: colors.blue },
        paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 1 },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: '공공문서 편집 검증 요구사항 | 내부 검토용', size: 18, color: colors.muted, font: 'Malgun Gothic' })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: '페이지 ', size: 18, color: colors.muted, font: 'Malgun Gothic' }),
            PageNumber.CURRENT,
            new TextRun({ text: ' / ', size: 18, color: colors.muted, font: 'Malgun Gothic' }),
            PageNumber.TOTAL_PAGES,
          ],
        })],
      }),
    },
    children: [
      new Paragraph({ style: 'Title', children: [new TextRun('공공 HWPX 편집·검수 요구사항')] }),
      new Paragraph({ style: 'Subtitle', children: [new TextRun('복합 첨부자료 기반 API 자동화 평가용 요구조건 명세서')] }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: '수신: ', bold: true }),
          new TextRun('문서자동화 사업 수행팀'),
        ],
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: '기준일: ', bold: true }),
          new TextRun('2026-06-30'),
        ],
      }),
      new Paragraph({
        spacing: { after: 280 },
        children: [
          new TextRun({ text: '결정요청: ', bold: true }),
          new TextRun('다중 파일 근거를 HWPX에 반영하는 과정에서 원본 서식·객체·패키지 무결성을 보장할 것'),
        ],
      }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('1. 목적과 적용 범위')] }),
      new Paragraph('이 명세서는 HWPX 원본, PDF 대조본, XLSX·CSV 수치자료, DOCX 요구사항, TXT 회의결정 및 이미지 증빙을 함께 사용하여 공공기관 보고서를 수정하거나 신규 작성할 때 적용한다. 단순 텍스트 일치만으로 합격 처리하지 않으며, 저장 후 재열기와 실제 페이지 렌더를 모두 요구한다.'),
      bullet('모든 쓰기 명령은 현재 리비전과 사전 조회된 정확한 대상을 사용한다.'),
      bullet('수치·날짜·위험등급은 첨부 간 기준일 차이를 해결한 뒤 반영한다.'),
      bullet('사용자가 요청하지 않은 표, 그림, 머리말, 꼬리말, 페이지 설정은 보존한다.'),
      bullet('개인정보와 보안상 민감한 값은 결과 문서로 전사하지 않는다.'),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('2. 기능 요구사항')] }),
      makeTable(['ID', '검증 요구사항', '등급', '영역'], requirementRows, [900, 5960, 1100, 1400]),
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('3. 위험 판정 및 조치')] }),
      new Paragraph('각 시나리오는 아래 위험을 독립적으로 판정한다. 동일 문서에서 복수 위험이 발생하면 가장 높은 통제수준을 적용하고, 결과 보고서에는 실패 단계와 재현 가능한 근거를 함께 기록한다.'),
      makeTable(['위험', '발생 조건', '판정', '필수 조치'], riskRows, [1600, 3560, 1400, 2800]),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('3.1 수치 교차검증 규칙')] }),
      bullet('집행률 = 집행액 ÷ 본예산으로 계산하며 60% 미만이면 위험으로 분류한다.'),
      bullet('지연건수 5건 이상이면 조치계획과 14일 이내 기한을 본문에 명시한다.'),
      bullet('금액 표시는 백만원 단위 반올림값을 쓰되 정답데이터에는 원 단위 값을 보존한다.'),
      bullet('합계가 맞지 않으면 임의로 맞추지 않고 “재확인 필요”와 차액을 표시한다.'),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('3.2 개인정보 통제 규칙')] }),
      new Paragraph('첨부파일에 존재하는 직접 식별자는 읽기 단계에서 검출하되 결과 HWPX에는 기록하지 않는다. 품질보고서에는 검출·마스킹 건수와 원본 파일 ID만 기록하고 실제 값은 남기지 않는다.'),
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('4. 최종 인수 기준')] }),
      bullet('HWPX 패키지를 다시 열 수 있고 XML·관계·미디어 항목이 모두 해석된다.'),
      bullet('지정된 대상 텍스트와 표 셀 값이 정답데이터와 정확히 일치한다.'),
      bullet('원본 대비 표·그림·이미지 개수의 비의도 변화가 없다.'),
      bullet('첫쪽·중간쪽·마지막쪽 렌더가 비어 있지 않고 클리핑·중첩·누락이 없다.'),
      bullet('실패 배치는 부분 변경 없이 원래 리비전과 원문으로 롤백된다.'),
      bullet('최종 산출물의 SHA-256과 평가 결과 JSON이 함께 보관된다.'),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('4.1 점수 하한')] }),
      new Paragraph('내용 정확성 35점, 레이아웃 20점, 서식 일관성 15점, 객체 보존 10점, 패키지 무결성 10점, 재열기·API 사용성 10점으로 평가한다. 패키지 재열기 실패, 개인정보 노출, 부분 저장은 총점과 무관하게 즉시 불합격이다.'),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('4.2 검수 증적')] }),
      new Paragraph('각 시나리오는 입력 파일 해시, API 호출 단계, 적용 명령, 저장 파일 해시, 구조검사 결과, 원본·수정 렌더 페이지 해시 및 실패 사유를 남긴다. 실행하지 않은 검사는 통과로 기록하지 않는다.'),
    ],
  }],
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, await Packer.toBuffer(doc));
console.log(outputPath);
