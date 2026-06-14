# HWPX API-Only Editor Improvement Report

## 1. Executive Summary

현재 구현은 "HWPX가 깨지지 않고 저장되며, API 명령만으로 지정 셀과 문단 값을 채운다"는 1차 목표는 달성했다. 그러나 사용자가 요구한 최종 기준인 "원본 서식, 폰트 모양, 표 구조, 개조식 표현, 차트/이미지/레이아웃까지 유지하면서 완성 문서를 만든다"는 기준에는 아직 도달하지 못했다.

따라서 다음 의사결정은 단순 API 추가가 아니라, RHWP editor/runtime 코드까지 포함해 HWPX 문서 모델을 더 깊게 제어하는 방향으로 잡아야 한다. 핵심은 세 가지다.

1. 원본의 스타일과 레이아웃 제약을 JSON으로 정확히 읽어야 한다.
2. 명령은 텍스트 값만 쓰는 것이 아니라, 기존 run/table/list/chart/object 스타일을 복제하거나 보존해야 한다.
3. 저장 후 API 재오픈 검증만으로 끝내지 않고, 페이지 이미지 렌더링과 가능하면 Hancom reopen/PDF 검증까지 품질 게이트로 묶어야 한다.

## 2. What Was Verified

이번 작업에서 만든 산출물:

- ESG API 작성본: `C:\CC\academic_editor_project\output\hwpx-review\api-preserve\01-esg-original.api-preserve-filled.hwpx`
- sample API 작성본: `C:\CC\academic_editor_project\output\hwpx-review\sample-report-api-preserve\sample-input.api-preserve-authored.hwpx`
- 비교 렌더 이미지: `C:\CC\academic_editor_project\output\hwpx-review\rendered-compare`

실행 검증:

- `npm.cmd run test:hwpx-api`
- `npm.cmd run hwpx:fill:esg`
- `npm.cmd run hwpx:author:sample`
- Docker `rhwp export-png` with Windows fonts, `--max-dimension 1700`

현재 확인된 안정화:

- HWPX no-edit 저장은 원본 bytes를 그대로 반환한다.
- `preserve-package` 저장 방식으로 원본 ZIP 패키지를 유지하고 `Contents/sectionN.xml`의 대상 노드만 패치한다.
- 중복으로 같은 셀을 수정해도 마지막 명령만 반영해 XML 좌표가 밀려 깨지는 문제를 막았다.
- 표가 포함된 문단을 `replaceParagraphText`로 수정할 때 표 셀 내용이 지워지는 문제를 막았다.
- sample 입력 파일 기준 10페이지, 85문단, 15개 API-discovered table이 저장 후에도 유지된다.

## 3. Visual Quality Findings

### ESG Template

ESG 원본과 API 작성본은 같은 표 틀, 행 높이, 셀 배치가 대체로 유지된다. 폼 문서처럼 정해진 셀에 내용을 채우는 경우에는 현재 접근이 꽤 유효하다.

남은 문제:

- 긴 텍스트가 셀 내부에서 줄바꿈, 크기 축소, 문단 간격 조절 없이 들어간다.
- 글머리표는 텍스트 문자 `•`로 들어가며 HWPX list/bullet 구조로 생성되지 않는다.
- 원본 placeholder 색상/강조/문자 스타일과 작성 값 스타일을 구분하는 정책이 없다.

### Sample Report

sample 보고서는 API 재오픈 기준으로는 성공이지만, 시각 품질 기준으로는 미흡하다.

확인된 문제:

- 1페이지 표지의 긴 제목이 원본 제목 영역의 폰트/간격/폭 제약에 맞춰 조절되지 않는다.
- 2페이지는 원본의 여러 표형 요약 구조를 API 작성본이 사실상 큰 박스 안 bullet 요약으로 사용하고 있어 템플릿 구조가 유지됐다고 보기 어렵다.
- 4페이지 이후 표 값은 들어가지만, 셀별 정렬, 숫자 폭, 본문 간격, 분석 의견 박스의 문장 길이 제약이 자동으로 맞춰지지 않는다.
- 차트 데이터는 API가 테이블 값을 바꿔도 같이 갱신되지 않는다. 현재 문서 안 차트는 원본 객체 또는 기존 값에 의존한다.
- 개조식 표현은 HWPX bullet/list 객체가 아니라 일반 텍스트로 들어가므로 원본 문서의 list style을 보존하지 못한다.
- 렌더링 경고 `LAYOUT_OVERFLOW`는 원본과 API 작성본 모두에서 동일하게 발생해 이번 편집이 만든 신규 붕괴는 아니지만, QA 시스템에서는 별도 분류가 필요하다.

결론: ESG 같은 "정해진 양식 셀 채우기"는 현재 방식으로 가능성이 높다. sample 같은 "보고서 전체를 완성도 있게 작성"하는 경우에는 현재 API만으로는 스타일/레이아웃 제어 무기가 부족하다.

## 4. Root Causes

1. JSON export가 내용 중심이고 스타일 중심이 아니다.
   현재 API는 문단/표/셀 텍스트를 잘 읽지만, charPr, paraPr, bullet/numbering, borderFill, cell margin, vertical align, chart data, object anchor 같은 작성 판단에 필요한 정보를 충분히 LLM-friendly하게 제공하지 않는다.

2. command가 "텍스트 쓰기" 수준에 머문다.
   `setCellText`, `replaceParagraphText`는 원본 셀의 첫 paragraph template을 재사용하지만, 여러 run 스타일, bullet 구조, 셀별 정렬 정책, 줄간격, 글자 크기 축소를 세밀하게 보존하지 못한다.

3. 템플릿의 의도를 API가 모른다.
   예를 들어 "요약 표", "분석 의견 박스", "차트 아래 설명", "표지 제목"은 모두 서로 다른 쓰기 정책이 필요하다. 지금은 table/cell 좌표만 알고, 그 영역이 어떤 역할인지 알지 못한다.

4. 차트/이미지/그림 객체가 편집 대상에 들어오지 않았다.
   보고서 품질은 표 텍스트뿐 아니라 차트 데이터, 그림 위치, 제목 스타일이 같이 바뀌어야 한다. 현재 명령 세트는 차트 객체를 읽고 갱신하는 API가 없다.

5. 시각 검증이 개발 루프 후반에 들어왔다.
   API 재오픈 검증은 구조 안정성에는 좋지만, 최종 사용자가 보는 품질을 보장하지 않는다. 페이지 이미지 비교가 처음부터 자동화돼 있었다면 시행착오가 훨씬 줄었을 것이다.

## 5. What Would Have Shortened The Work

가장 시간이 많이 든 지점은 "API상 성공"과 "실제 화면상 성공"이 다르다는 사실을 뒤늦게 분리한 것이다. 아래 도구가 있었다면 작업시간을 크게 줄일 수 있었다.

- `export-json --include styles,layout,objects`: 문단/셀 텍스트뿐 아니라 스타일 ID, 실제 run 목록, list/bullet, cell geometry, chart/object metadata를 한 번에 확인.
- `commands/dry-run --explain`: 각 명령이 어느 XML 노드와 어떤 run/cell을 바꾸는지 사전 보고.
- `save/roundtrip-diff`: 저장 전후 page/paragraph/table/cell/object count와 주요 target value를 자동 비교.
- `render/compare`: 원본/수정본을 같은 폰트로 렌더링하고 페이지별 이미지, bbox 이동량, overflow, 빈 영역 증가를 자동 리포트.
- `target-inspector`: tableId, row/col, cellIndex, merged cell anchor, paragraph contains table 여부를 UI/JSON으로 보여주는 도구.
- `style-profiler`: "이 셀은 숫자 오른쪽 정렬", "이 박스는 bullet paragraph", "이 제목은 font size 28 and center" 같은 쓰기 정책을 자동 추출.
- `fit-text`: 셀/문단 capacity를 계산해 줄바꿈, 폰트 축소, 문장 압축 중 하나를 선택.
- `chart-data API`: 문서 안 차트 데이터 소스와 series/category/value를 읽고 갱신.

## 6. Recommended Architecture

### 6.1 Keep The Split, Deepen HWPX

DOCX는 기존 WOPI/Collabora 경로를 유지한다. HWPX는 RHWP 전용 런타임을 유지하되, RHWP editor/runtime 코드를 수정해 API 제어 능력을 키운다.

이유:

- DOCX 경로는 이미 별도 생태계와 WOPI 계약이 있다.
- HWPX를 WOPI처럼 억지로 광고하면 "열림"과 "저장/편집 품질"이 불일치할 수 있다.
- HWPX는 RHWP 내부 모델과 HWPX XML 패키지 구조를 직접 다뤄야 고품질 제어가 가능하다.

### 6.2 Add A HWPX Document Intelligence Layer

`HwpxApiSession.exportJson()`을 단순 구조 덤프가 아니라 다음 층으로 확장한다.

- `styleGraph`: paraPr, charPr, borderFill, numbering/bullet, table/cell style.
- `layoutGraph`: page, bbox, cell bbox, object bbox, overflow 후보.
- `semanticHints`: title, cover, summary box, analysis note, numeric table, chart area, footer 등 자동 추정.
- `editableTargets`: 각 target의 capacity, current text, style policy, safe commands.
- `objectGraph`: chart, image, drawing, header/footer, footnote/endnote.

### 6.3 Replace Text Commands With Format-Preserving Commands

현재 명령:

- `replaceParagraphText`
- `setCellText`

필요한 명령:

- `replaceRunsPreserveStyle`: 기존 run 배열을 유지하고 텍스트만 재분배.
- `setCellRichText`: 셀 내부에 여러 paragraph/run/list를 스타일 지정해 쓰기.
- `fillPlaceholder`: placeholder 영역의 색상/글꼴은 제거하고 본문 스타일로 채우기.
- `applyList`: HWPX bullet/numbering 객체 기반 개조식 문단 생성.
- `fitTextToBox`: bbox/cell capacity 안에 맞게 줄바꿈 또는 글자 크기 조정.
- `cloneStyleFrom`: 원본 셀/문단/표의 스타일을 다른 target에 복제.
- `setChartData`: chart series/category/value 갱신.
- `replaceImage` / `insertFigureWithCaption`: 이미지와 캡션 객체 갱신.
- `setObjectPosition`: 그림/차트/표의 anchor, wrap, offset 조정.

### 6.4 Use RHWP Editor Code, Not Only XML Patch

현재 preserve-package XML patch는 안전한 저장에는 유리하지만, 고품질 편집에는 한계가 있다. 다음 기능은 RHWP editor/runtime 내부를 수정해서 public API로 노출하는 편이 맞다.

- selection/caret 기반 edit command를 session API에서 호출 가능하게 만들기.
- editor command history와 server command result를 같은 command model로 통합.
- style copy/paste, paragraph split/merge, table cell rich text 편집을 editor core에서 처리.
- render tree와 edit target을 연결해 "이 bbox의 실제 문서 노드"를 역추적.
- save 전 editor model과 package serializer가 동일 결과를 만들도록 roundtrip serializer 보강.

## 7. API Design Additions

우선 추가가 필요한 API:

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/hwpx/sessions/{sid}/analyze` | 문서 구조, 스타일, 레이아웃, 의미 영역, 편집 가능 target 분석 |
| `POST /v1/hwpx/sessions/{sid}/targets/inspect` | target 주변 스타일/셀 병합/용량/안전 명령 조회 |
| `POST /v1/hwpx/sessions/{sid}/commands/dry-run` | XML/model 영향 범위와 예상 경고 반환 |
| `POST /v1/hwpx/sessions/{sid}/layout/fit-text` | 텍스트를 셀/박스에 맞추는 줄바꿈/축약/폰트 크기 제안 |
| `POST /v1/hwpx/sessions/{sid}/charts` | 차트 목록, 데이터 소스, series 조회 |
| `POST /v1/hwpx/sessions/{sid}/charts/{chartId}/data` | 차트 데이터 갱신 |
| `POST /v1/hwpx/sessions/{sid}/qa/render-compare` | 원본/현재본 페이지 이미지 비교, overflow, bbox drift 리포트 |
| `POST /v1/hwpx/sessions/{sid}/qa/reopen` | RHWP reopen, optional Hancom reopen/PDF 검증 |

명령 추가 우선순위:

1. `setCellRichText`
2. `replaceRunsPreserveStyle`
3. `fitTextToBox`
4. `applyList`
5. `cloneStyleFrom`
6. `setChartData`
7. `replaceImage`
8. `setObjectPosition`

## 8. Quality Gate Proposal

HWPX API 작성 성공 조건은 다음 네 단계로 정의해야 한다.

1. Structural gate: 저장 후 page/section/paragraph/table/cell/object count가 기대값과 맞는다.
2. Semantic gate: 지정 target의 값이 API 재오픈 결과에서 정확히 읽힌다.
3. Visual gate: 렌더 이미지 기준으로 overflow, 빈 페이지 증가, 주요 bbox 이동, 텍스트 누락이 없다.
4. Hancom gate: 서버에 Hancom Automation이 있으면 reopen + PDF save까지 통과한다.

운영상 최소 기준:

- 개발/CI: structural + semantic + RHWP visual.
- 릴리즈 전: 주요 fixture에 대해 Hancom gate 포함.
- 고객 문서 자동 작성: 실패 시 "작성본"을 제공하지 말고 QA 리포트와 수정 필요 target을 반환.

## 9. Implementation Roadmap

### Phase 1: API Target And Style Intelligence

- JSON export에 styleGraph/layoutGraph/objectGraph 추가.
- table cell target을 row/col/cellIndex/merged anchor까지 명확히 노출.
- paragraph contains control/table 여부를 export와 target inspect에서 표시.
- render image endpoint를 API 문서 계약대로 WebP quality 20, max 1700px로 구현.

### Phase 2: Format-Preserving Edit Commands

- `setCellRichText`, `replaceRunsPreserveStyle`, `applyList` 구현.
- 기존 XML patch는 fallback으로 두고, 가능한 경우 RHWP document/editor command model을 사용.
- command마다 save/reopen/render fixture 테스트 추가.

### Phase 3: Report Authoring Loop

- LLM이 바로 긴 문장을 쓰지 않고, `analyze -> plan targets -> draft within capacity -> dry-run -> render-compare -> revise` 루프를 타게 한다.
- target마다 "허용 길이", "권장 문장 수", "개조식 여부", "숫자 표 여부"를 제공.
- 내용이 넘치면 API가 자동으로 글자 크기 축소, 줄바꿈, 문장 압축, 다음 페이지 분산 중 하나를 제안.

### Phase 4: Chart/Object Editing

- chart object parsing and data update.
- image replacement and caption management.
- header/footer/footnote/endnote edit support.

### Phase 5: Hancom Validation Integration

- Windows 서버에 Hancom이 있을 때 optional authoritative validation worker 추가.
- API 결과를 Hancom으로 열고 PDF 저장까지 확인.
- RHWP renderer와 Hancom PDF 이미지 차이를 fixture별로 비교.

## 10. Product Decision

계속 진행할 가치가 있다. 다만 다음 스프린트 목표를 "API 명령 몇 개 추가"로 잡으면 다시 같은 한계에 부딪힌다. 목표를 "HWPX template-preserving authoring engine"으로 잡고, editor code/RHWP runtime/API/QA를 함께 손봐야 한다.

추천 방향:

- 단기: ESG 같은 정형 셀 채우기 문서의 성공률을 높인다.
- 중기: sample 보고서처럼 여러 페이지, 표, 차트, 분석 박스가 섞인 문서를 위한 style-preserving command set을 만든다.
- 장기: Hancom Automation을 optional oracle로 붙여 RHWP와 Hancom 결과 차이를 줄인다.

현재 상태를 한 문장으로 정리하면: "깨지지 않는 API 저장 기반은 확보했지만, 완벽한 API-only 작성본을 만들려면 스타일/레이아웃/차트/시각 QA까지 포함한 편집 엔진으로 확장해야 한다."
