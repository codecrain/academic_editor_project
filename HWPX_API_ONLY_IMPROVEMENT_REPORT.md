# HWPX API-only 작성/편집 개선 보고서

작성일: 2026-06-13

## 1. 결론

현재 rhwp 기반 HWPX API-only 경로는 "문서에 텍스트를 추가하고 재오픈해서 일부 문자열을 확인하는 수준"은 가능하지만, "원본 문서를 유지하면서 필요한 위치를 읽고 수정하고, 사람이 볼 수 있는 완성 보고서를 만드는 수준"에는 도달하지 못했다.

가장 큰 문제는 작성 내용의 품질이 아니라 기반 계약이다. `sample-input.hwpx`는 아무 수정 없이 `HwpDocument.exportHwpx()`만 호출해도 10페이지가 15페이지로 바뀌고, 원본 구조 일부가 사라진다. 이 상태에서는 어떤 API 명령을 잘 조합해도 "완벽한 수정"을 보장할 수 없다.

## 2. 이번 작업에서 확인한 사실

대상 파일:

- 원본: `C:/CC/tlooto_onpremise_project/server2/generated/document_editor_api_samples/sample-input.hwpx`
- API-only 작성본: `C:/CC/academic_editor_project/output/hwpx-review/sample-report-api-only/sample-output.api-only-authored.hwpx`
- 당시 API-only 작성 스크립트: `C:/CC/academic_editor_project/editor_docx/scripts/author-sample-report-api-only.mjs` (레거시 실패 기록; 현행 HWPX 작성 경로는 `editor_hwpx/scripts/author-sample-report-api-preserve.mjs`)

API로 읽은 원본은 다음과 같았다.

- 페이지 수: 10
- 상위 문단 수: 85
- API 텍스트 레이아웃에서 보이는 주요 문구: `2025년 기부·답례품 실적 분석보고서 요약`, `기부통계`, `요일별 기부 건수 및 기부 금액`, `시간대별 기부 건수`, `기부 금액별 기부 건수`, `기부 금액별 기여도`

무편집 저장 테스트 결과:

| 항목 | 원본 | 무편집 API export |
| --- | ---: | ---: |
| 페이지 수 | 10 | 15 |
| XML 문단 수 | 526 | 373 |
| 표 개수 | 19 | 16 |
| 셀 개수 | 423 | 270 |
| 그림 개수 | 7 | 7 |
| lineSeg 수 | 528 | 375 |

API-only 작성본 결과:

| 항목 | 값 |
| --- | ---: |
| 페이지 수 | 19 |
| 상위 문단 수 | 122 |
| 출력 파일 크기 | 660,934 bytes |
| 재오픈 후 `의사결정 매트릭스` 확인 | 성공 |
| 재오픈 후 `API-only 작성 검증 문장` 확인 | 성공 |
| 시각 품질 | 실패 |

즉 "텍스트 저장"은 됐지만 "문서 편집"은 됐다고 볼 수 없다.

## 3. 직접 본 결과

PNG 렌더 파일:

- 원본 1페이지: `C:/CC/academic_editor_project/output/hwpx-review/sample-report-api-only/png-compare/sample-input.png`
- API 작성본 마지막 페이지: `C:/CC/academic_editor_project/output/hwpx-review/sample-report-api-only/png-compare/api-authored.png`

원본 1페이지도 rhwp 렌더 기준으로 제목 일부와 큰 도형만 보이고, 원래 보고서의 구성 요소가 충분히 보이지 않는다. API 작성본 마지막 페이지는 더 심각하다. 텍스트가 페이지 상단에 몇 조각으로 흩어져 있고, 보고서 본문처럼 보이지 않는다.

이 결과는 "내용을 더 잘 쓰면 해결되는 문제"가 아니다. API가 문서의 배치, 객체 계층, 줄 레이아웃, 기존 표 구조를 안정적으로 보존하지 못하는 문제다.

## 4. 내가 잘못 접근했던 부분

첫째, API-only의 의미를 "API로 append해서 저장한다"에 가깝게 다뤘다. 사용자가 요구한 것은 원본 문서를 API로 읽고, 기존 구조를 이해하고, 정확한 위치를 수정해서 결과를 내는 것이다. append는 편집이 아니다.

둘째, 문서 구조 보존 검증보다 작성 성공 검증을 먼저 했다. HWPX에서는 무편집 round-trip이 깨지면 그 위의 작성 결과는 의미가 약하다. 앞으로는 무조건 `load -> export -> reopen`의 페이지 수, 표 수, 셀 수, 문단 수, 이미지 수, 렌더 diff를 먼저 통과시켜야 한다.

셋째, API의 능력을 "있는 함수 수"로 판단했다. `insertParagraph`, `insertText`, `applyCharFormat`이 있다고 해서 실제 편집이 가능한 것은 아니다. 사용자는 "어느 위치를 어떻게 특정해서 무엇을 바꿀 수 있느냐"가 필요하다.

넷째, 시각 검증 자동화가 부족했다. 텍스트 검증은 통과했지만 실제 렌더는 실패했다. 문서 편집 API에서는 텍스트 검증만으로는 충분하지 않다.

## 5. 작업 시간을 크게 줄였을 도구

1. 무편집 round-trip 게이트
   - 입력 HWPX를 열고 아무 수정 없이 저장한 뒤, 페이지 수/표 수/셀 수/이미지 수/문단 수/렌더 썸네일을 비교하는 자동 테스트가 먼저 있었어야 한다.

2. 구조 덤프 API
   - 현재 API는 "보이는 텍스트 일부"를 읽을 수 있지만, 문서 전체 객체 계층을 안정적으로 설명하지 못한다.
   - 필요 필드: `nodeId`, `path`, `type`, `page`, `bbox`, `text`, `style`, `children`, `sourceXmlRef`, `editable`.

3. 시각 diff 파이프라인
   - 원본/저장본/작성본을 페이지별 PNG로 뽑고, 빈 페이지, 텍스트 밀도, 객체 개수, bbox 변화량을 자동 산출해야 한다.

4. 명령 dry-run
   - 실제 저장 전 `이 명령이 어떤 노드 몇 개를 바꾸는지`, `예상 페이지 변화`, `위험 노드`를 보여주는 검증 API가 필요하다.

5. API cookbook
   - "표 셀 채우기", "기존 제목 수정", "본문 특정 절 교체", "텍스트박스 수정", "보고서 말미 부록 추가" 같은 목적별 예제와 금지 패턴이 있어야 한다.

## 6. API가 지금 갖춰야 할 최소 계약

아래 기능은 "API를 늘리는 것"이 아니라 현재 API가 편집 API라고 주장하기 위한 기본 계약이다.

### 6.1 문서 진단 API

- `GET /v1/hwpx/documents/{id}/integrity`
  - 페이지 수, 표 수, 셀 수, 그림 수, 도형 수, 문단 수, lineSeg 수, 지원되지 않는 객체 수를 반환한다.

- `POST /v1/hwpx/documents/{id}/roundtrip-check`
  - 무편집 저장 후 원본과 구조/렌더를 비교한다.
  - 이 API가 실패하면 작성/수정 API를 실행하면 안 된다.

### 6.2 구조 읽기 API

- `GET /v1/hwpx/documents/{id}/structure`
  - 문서 전체를 LLM과 프로그램이 모두 이해 가능한 JSON으로 반환한다.
  - 최소 포함: body paragraphs, tables, cells, text boxes, pictures, shapes, headers, footers, footnotes.

- `GET /v1/hwpx/documents/{id}/pages/{page}/objects`
  - 페이지에 실제 렌더되는 객체 목록과 bbox를 반환한다.

- `GET /v1/hwpx/documents/{id}/search`
  - 텍스트 검색 결과를 `nodeId`, `range`, `page`, `context`로 반환한다.

### 6.3 위치 기반 수정 API

- `PATCH /v1/hwpx/documents/{id}/nodes/{nodeId}/text`
  - 특정 문단, 셀, 텍스트박스, 헤더/푸터 텍스트를 교체한다.

- `POST /v1/hwpx/documents/{id}/nodes/{nodeId}/insert-before`
- `POST /v1/hwpx/documents/{id}/nodes/{nodeId}/insert-after`
  - 기존 문서 위치를 기준으로 삽입한다. 단순 문서 끝 append와 구분해야 한다.

- `PATCH /v1/hwpx/documents/{id}/ranges/{rangeId}`
  - 검색 결과나 선택 영역에 대해 텍스트/서식/문단 속성을 변경한다.

- `PATCH /v1/hwpx/documents/{id}/tables/{tableId}/cells/{row},{col}`
  - 셀 인덱스가 아니라 row/col span을 고려한 주소로 수정한다.

### 6.4 트랜잭션 API

- `POST /v1/hwpx/documents/{id}/transactions`
  - 여러 명령을 하나의 작업으로 실행한다.
  - 실패 시 롤백한다.

- `POST /v1/hwpx/documents/{id}/transactions/{txId}/validate`
  - 구조 손실, 페이지 폭증, 빈 페이지, 렌더 실패, 텍스트 누락을 검사한다.

- `POST /v1/hwpx/documents/{id}/transactions/{txId}/commit`
  - 검증 통과 후 저장한다.

### 6.5 렌더/검증 API

- `GET /v1/hwpx/documents/{id}/pages/{page}/image?format=webp&quality=20&max=1700`
  - 사용자가 이전에 요구한 이미지 API와 연결된다.

- `POST /v1/hwpx/documents/{id}/visual-diff`
  - 원본 대비 변경 페이지를 이미지/수치로 보여준다.

- `GET /v1/hwpx/documents/{id}/text-density`
  - 페이지별 텍스트 밀도와 빈 페이지 위험을 반환한다.

## 7. rhwp 내부에서 우선 고쳐야 할 것

### P0. 무편집 export 보존

현재 `sample-input.hwpx`는 무편집 export만 해도 구조가 바뀐다. 이 문제를 해결하기 전까지 API 편집은 신뢰할 수 없다.

필수 통과 조건:

- 원본 10페이지가 무편집 저장 후 10페이지 유지
- 표 19개 유지
- 셀 423개 유지
- 그림 7개 유지
- XML 문단 526개 수준 유지
- 주요 페이지 PNG가 빈 화면/깨진 배치가 아니어야 함

### P1. unsupported object 보존

serializer가 이해하지 못하는 객체라도 손실하면 안 된다. 편집하지 않은 영역은 raw XML 또는 IR extension으로 보존해야 한다.

### P2. 전체 문서 객체 tree 구축

API가 수정할 수 없는 영역은 `editable:false`로라도 드러나야 한다. 지금처럼 "API로 읽히지 않는 영역"이 존재하면 LLM은 문서 전체를 이해했다고 착각한다.

### P3. lineSeg/layout 재생성 안정화

텍스트는 저장됐는데 렌더가 쓰레기처럼 보이는 주요 원인이다. lineSeg, bbox, 줄 높이, 셀 내부 reflow를 실제 렌더와 맞춰야 한다.

### P4. 목적 기반 command recipe

저수준 API만 있으면 LLM이 잘못 조합한다. `fillReportSection`, `replaceMatchedParagraph`, `updateTableCellByHeader`, `appendAppendixWithPageBreak` 같은 레시피 계층이 필요하다.

## 8. API 문서에서 반드시 명확히 해야 할 것

API 문서는 엔드포인트 목록보다 다음 내용을 더 강하게 설명해야 한다.

- API-only 편집은 반드시 `read -> locate -> plan -> dry-run -> apply -> validate -> render-diff -> export` 순서로 한다.
- 문서 끝 append는 편집 성공으로 보지 않는다.
- 위치는 paragraph index만으로 잡지 않는다. `nodeId + path + page + text context`를 함께 쓴다.
- 저장 전 round-trip check가 실패한 파일은 "읽기/미리보기 가능, 편집 저장 위험" 상태로 표시한다.
- API가 수정할 수 없는 객체는 숨기지 말고 명시한다.
- 텍스트 검증과 시각 검증은 별개다. 둘 다 통과해야 성공이다.

## 9. 의사결정 제안

1. 지금 상태로 HWPX 편집 저장을 제품 기능으로 열면 안 된다.
   - 이유: 무편집 저장부터 원본 구조가 손실된다.

2. API를 무작정 추가하지 말고, 먼저 `roundtrip-check`, `structure`, `visual-diff`, `transaction validate`를 만든다.
   - 이 네 가지가 있어야 필요한 API와 불필요한 API를 구분할 수 있다.

3. 편집 엔진은 두 계층으로 나눈다.
   - 안정 계층: 원본 패키지/미지원 객체 보존, raw XML preservation.
   - 편집 계층: 지원되는 노드만 구조화해서 수정.

4. 단기적으로는 "편집 가능 파일"과 "편집 위험 파일"을 분리한다.
   - `sample-input.hwpx` 같은 파일은 현재 편집 위험 파일이다.

5. 다음 개발 목표는 "완벽한 보고서 작성"이 아니라 "원본 10페이지를 무편집 저장해도 그대로 보존"이다.
   - 이것이 통과되면 그 다음에 기존 절/표/텍스트박스를 정확히 수정하는 API-only 보고서 작성을 다시 시도해야 한다.

## 10. 다음 작업 순서

1. `roundtrip-check` 스크립트를 정식 테스트로 추가한다.
2. `sample-input.hwpx` 무편집 export 손실 원인을 parser/serializer 단위로 추적한다.
3. 누락되는 표 3개와 셀 153개가 어떤 XML 구조에서 사라지는지 diff한다.
4. serializer가 미지원 객체를 raw로 보존하도록 설계한다.
5. `structure` API를 추가하고, 모든 노드에 stable id/path/bbox/editable을 부여한다.
6. 기존 API 문서를 "명령 목록"에서 "편집 워크플로우와 검증 계약" 중심으로 재작성한다.
7. 같은 샘플로 다시 API-only 수정 시나리오를 수행한다.

## 11. 최종 판단

지금의 API-only 작성본은 실패작이다. 사용자가 말한 대로 보고서 품질로는 사실상 의미가 없다. 그러나 실패 원인은 명확하다. "작성 문장"의 문제가 아니라 "문서를 온전히 읽고, 위치를 잡고, 보존하면서 저장하는 편집 기반"이 아직 부족하다.

따라서 개선 방향은 API를 많이 늘리는 것이 아니라, 먼저 API가 문서 편집 엔진으로서 지켜야 할 보존/위치/검증 계약을 세우는 것이다. 그 계약을 통과한 뒤에만 고수준 작성 API를 추가해야 한다.
