# HWPX 편집기 DOCX 동급화 및 실제 환경 검수 설계

- 작성일: 2026-07-27
- 상태: 승인됨
- 대상: `editor_hwpx`, 공용 editor gateway/MCP, HWPX 평가 데이터와 문서
- 최종 판정 환경: 프로젝트 HWPX 편집기와 한컴오피스 2024

## 1. 목적

HWPX 편집기의 공개 편집 기능, REST API, MCP 도구, 렌더링·내보내기,
문서화와 평가 체계를 DOCX 편집기와 같은 제품 수준으로 승격한다.

단순히 명령 이름만 맞추지 않는다. 명령을 실제 HWPX 파일에 적용하고 저장한 뒤
프로젝트 편집기와 한컴오피스 2024에서 다시 열어 내용, 구조, 첨부물과 화면 결과가
보존되는지를 확인해야 지원 기능으로 인정한다.

## 2. 현재 확인된 상태

### 2.1 이미 공개된 HWPX 기능

현재 HWPX command catalog에는 텍스트 검색·교체, 문단 뒤 삽입, 표 셀 편집,
그림 교체·삭제, 텍스트 상자 편집·삭제, 체크박스, 배경 채우기, 문단 정렬 등
17개 명령이 공개되어 있다.

REST와 MCP는 같은 catalog를 사용하며, HWPX 명령의 trial 적용과 atomic commit,
artifact 저장, SVG 렌더링 경로가 존재한다.

### 2.2 DOCX에만 공개된 기능

다음 기능은 DOCX 공개 catalog에는 있지만 HWPX 공개 catalog에는 없다.

1. `text.replaceTracked`
2. `insertText`
3. `deleteRange`
4. `appendParagraph`
5. `table.create`
6. `table.insertCaption`
7. `applyStyle`
8. `setRunStyle`
9. `setParagraphStyle`
10. `image.insertAfterParagraph`
11. `setDocumentMetadata`
12. `defineStyle`
13. `setPageSetup`
14. `setHeaderFooter`
15. `insertFootnote`

### 2.3 RHWP 엔진에 이미 있는 기반 기능

RHWP Rust/WASM에는 텍스트 삽입·삭제, 문단 삽입, 표 생성과 행·열 삽입,
그림 삽입, 스타일 생성·적용, 문자·문단 서식, 쪽 설정, 머리말·꼬리말,
각주, HWPX export와 snapshot/batch 기능이 이미 있다.

따라서 15개 격차 중 14개는 주로 공개 command adapter, target resolution,
저장 정책과 검증을 보강하면 승격할 수 있다. 변경 내용 추적은 현재 RHWP 문서
모델과 serializer에서 확인되지 않았으므로 별도 엔진 기능으로 취급한다.

### 2.4 PDF 제약

RHWP PDF renderer는 native 전용이며 WASM 빌드에는 포함되지 않는다.
그러므로 현재 WASM gateway에서 형식적으로 PDF endpoint만 열어서는 안 된다.
프로덕션 경로는 RHWP native CLI/sidecar를 사용하고, 한컴오피스 PDF 출력은
실제 환경 검수용 oracle로만 사용한다.

## 3. 채택한 접근법

검증형 하이브리드 구조 저장을 채택한다.

기존 원본 패키지 보존 방식으로 안전하게 처리할 수 있는 명령은 현재 경로를
유지한다. 표 생성, 각주, 머리말·꼬리말, 쪽 설정처럼 XML 구조를 새로 만드는
명령은 RHWP document model에서 실행하고 HWPX candidate를 export한다.

candidate는 즉시 사용자 문서로 확정하지 않는다. 패키지 보존 검사, 재열기,
구조 재탐색, SVG 렌더 검사를 모두 통과한 경우에만 하나의 revision으로
commit한다.

RHWP export 과정에서 특정 원본 항목이나 확장 XML이 유실되는 사례가 발견되면
wrapper에서 결과만 숨기지 않는다. 해당 serializer 또는 package merge 정책을
수정하고 회귀 테스트를 추가한다.

## 4. 목표 아키텍처

### 4.1 명령 adapter

`editor_hwpx/scripts/hwpx-structural-commands.mjs`를 구조 명령의 집중 진입점으로
둔다. 공개 command payload를 RHWP의 paragraph/run/table/control 식별자로
해석하고, 엔진 호출 결과를 공통 editor result 형태로 변환한다.

각 adapter는 다음 계약을 지킨다.

- 입력 schema를 명시적으로 검증한다.
- target이 없거나 모호하면 변경 전에 실패한다.
- 엔진이 반환한 식별자와 적용 전후 구조 차이를 사용해 생성 객체를 재탐색한다.
- 결과에 재사용 가능한 `target`, native id, 생성 객체 요약을 반환한다.
- 내부 오류를 성공 또는 0건 변경으로 바꾸지 않는다.

### 4.2 저장 분류와 패키지 정책

`editor_hwpx/scripts/hwpx-package-policy.mjs`가 명령 batch를 다음과 같이 분류한다.

- patch-safe: 현재 preserve-package 경로 사용
- structural-export: RHWP export와 package qualification 필요
- unsupported: 명시적 오류

structural-export 후보에는 다음 검사를 적용한다.

- 필수 ZIP entry와 manifest/relationship 일관성
- 입력의 알 수 없는 비충돌 entry 보존
- BinData와 embedded object의 수, media type, hash 보존
- section, paragraph, table, image, header/footer, footnote 수의 의도하지 않은 감소
- candidate 재열기 성공
- 현재 revision과 candidate의 SVG 렌더 성공

원본 entry를 candidate에 다시 overlay할 때는 경로가 같거나 관계가 변경된
항목을 무조건 덮어쓰지 않는다. 충돌 항목은 명시적 정책과 테스트가 있을 때만
병합한다.

### 4.3 원자적 batch 흐름

하나의 요청은 다음 순서로 실행한다.

1. 문서와 예상 revision 확인
2. 모든 명령의 schema와 target precondition 확인
3. trial snapshot 생성
4. trial document에 전체 명령 순서대로 적용
5. candidate HWPX export
6. package qualification과 필요한 안전한 overlay
7. candidate 재열기와 생성 객체 재탐색
8. SVG 구조·비공백 렌더 검사
9. artifact 저장과 revision 1회 증가

1~8 중 하나라도 실패하면 원본 bytes, artifact와 revision을 변경하지 않는다.

### 4.4 REST와 MCP

REST와 MCP는 별도 기능 목록을 유지하지 않고 하나의 canonical HWPX catalog를
사용한다. 각 기능은 다음 표면에 동시에 반영한다.

- catalog/describe
- 단일 명령 apply
- atomic batch apply
- revision conflict
- render
- save/download
- artifact metadata
- PDF export

MCP 결과와 REST 결과는 operation별 changed count, 생성 target, warning/error
code, revision과 artifact hash에서 의미가 같아야 한다.

### 4.5 PDF

RHWP native CLI를 Docker에서 재현 가능하게 빌드한다. gateway는 요청마다
격리된 임시 디렉터리에서 제한된 child process로 CLI를 실행하고, timeout,
종료 코드, 출력 파일 존재 여부, PDF magic bytes와 페이지 수를 확인한다.

gateway가 시작한 child process와 임시 디렉터리는 성공·실패 모두 `finally`에서
정리한다. 기존에 실행 중인 다른 gateway, Docker container 또는 한컴 프로세스는
종료하지 않는다.

### 4.6 변경 내용 추적

`text.replaceTracked`는 일반 replace 뒤 metadata만 붙이는 방식으로 구현하지
않는다.

구현 전에 다음 증거를 확보한다.

1. 한컴오피스 2024에서 추적 변경을 포함한 HWPX 생성
2. 생성 파일의 package/XML 구조와 표준 schema 확인
3. 열기-무변경 저장 후 추적 정보 보존 확인
4. 수락·거절 후 본문과 revision 정보 변화 확인

표준 HWPX 표현이 확인되면 RHWP document model, parser, serializer와 공개
command를 함께 구현한다. 표준 표현이 없고 한컴 전용 비공개 바이너리 또는
외부 상태에만 존재한다면 그 사실을 증거와 함께 별도 판정한다. 이 경우
일반 replace를 동등 기능으로 오표기하지 않는다.

## 5. 실제 환경 평가 설계

### 5.1 데이터 규모

기존 공공기관 고난도 100건을 회귀 세트로 유지하고, 신규 구조 편집 중심
150건을 추가해 총 250건으로 확장한다.

- 기존 편집 시나리오: 90건
- 기존 생성 시나리오: 10건
- 신규 구조 편집·복합 시나리오: 135건
- 신규 생성 시나리오: 15건
- 전체 생성 시나리오: 25건

질문은 모두 100자 이상 1000자 이하이며, 하나의 요청에 여러 입력 파일과
여러 HWPX 편집 의무가 포함되어야 한다.

### 5.2 입력 자료

HWPX를 모든 사례의 주 문서 또는 결과 문서로 포함한다. 보조 자료는 HWP,
DOCX, PDF, XLSX, CSV, TXT, PNG/JPEG와 기타 실제 embedded object를 조합한다.

공공기관 공개 자료는 출처, 다운로드 시각, 원본 URL, license 또는 이용 조건,
SHA-256을 manifest에 기록한다. 외부 자료를 가져오지 못한 사례는 임의의 성공
자료로 바꾸지 않고 fixture origin을 명시한다.

### 5.3 정답 데이터

정답은 결과 파일 하나가 아니라 obligation ledger로 구성한다.

- 각 명령의 입력 근거와 예상 target
- 반드시 존재해야 할 텍스트, 표, 그림, 스타일과 control
- 변경되면 안 되는 텍스트, 객체와 첨부 hash
- 예상 페이지·section·표·그림·각주·머리말/꼬리말 범위
- REST/MCP 예상 결과와 오류 조건
- 프로젝트 편집기 렌더 조건
- 한컴오피스 열기·재저장·PDF 조건
- 부분 점수 없이 반드시 통과해야 하는 hard gate

레이아웃은 단일 screenshot pixel equality만 사용하지 않는다. 구조 count,
텍스트 anchor, bounding box 허용 범위, 페이지 수, 비공백 비율과 선택된
화면 diff를 함께 판정한다.

### 5.4 실제 호출

각 사례는 사람이 결과 파일만 복사하지 않고 아래 전체 흐름을 수행한다.

1. 격리 gateway 시작
2. REST로 문서 업로드와 명령 적용
3. 같은 기능을 MCP tool call로 재현 또는 검증
4. artifact 다운로드와 hash 확인
5. 프로젝트 HWPX 편집기에서 열기·렌더
6. 한컴오피스 2024 automation으로 열기
7. 복구 경고나 대화상자 감지
8. 다른 이름으로 재저장
9. PDF 출력
10. 재저장 HWPX와 PDF를 자동 검사
11. 호출 기록, 화면과 결과 manifest 저장

자동화 보안 경고나 사람 확인이 필요한 대화상자가 나타나면 이를 통과로
간주하지 않는다. 사례를 명시적인 `human_gate` 또는 실패로 기록한다.

### 5.5 실패 기준

다음 중 하나라도 발생하면 해당 사례는 실패한다.

- package entry 또는 embedded object 유실
- 한컴오피스 복구/손상 경고
- 프로젝트 편집기 또는 한컴오피스에서 열기·재저장 실패
- 요청한 생성 객체가 재탐색되지 않음
- 요청하지 않은 본문·표·그림·쪽 구조 손상
- atomic batch의 일부만 적용
- 빈 SVG/PDF 또는 예상 범위를 벗어난 페이지 수
- REST와 MCP 의미 불일치
- 증거 파일이나 호출 transcript 누락

### 5.6 산출물

실행 중 대용량 원본, 임시 HWPX/PDF, screenshot, cache는 `.qa` 아래에 두고
Git에서 제외한다.

저장소에는 다음의 제한된 결과만 남긴다.

- scenario와 attachment manifest
- obligation/gold 데이터
- 평가 runner와 판정 코드
- 사례별 bounded JSON 결과
- 전체 scorecard와 알려진 한계

## 6. 테스트 전략

모든 새 기능은 테스트 주도 방식으로 개발한다.

1. 공개 계약과 실패 조건을 나타내는 테스트를 먼저 작성한다.
2. 해당 테스트가 기존 코드에서 기대한 이유로 실패하는 것을 확인한다.
3. 최소 구현으로 통과시킨다.
4. package, REST, MCP, 렌더와 실제 환경 회귀를 순서대로 확대한다.

테스트 계층은 다음과 같다.

- command adapter unit tests
- package qualification/overlay fixture tests
- atomic batch and revision tests
- REST gateway integration tests
- MCP parity tests
- native PDF integration tests
- 프로젝트 편집기 렌더 tests
- 한컴오피스 2024 acceptance tests
- 250개 전체 evaluation

한컴오피스 검수는 unit test 통과를 대신하지 않으며, unit test만으로 실제 환경
통과를 주장하지 않는다.

## 7. 문서화 정책

기능은 구현 코드가 존재하는 시점이 아니라 실제 검수 gate를 통과한 시점에
지원 상태로 문서화한다.

다음 문서를 canonical catalog와 실제 endpoint에 맞춰 갱신한다.

- `API.md`
- `README.md`
- `docs/DOCUMENTATION_INDEX.md`
- `docs/HWPX_EDITOR.md`
- `docs/HWPX_MCP_API.md`

오래된 계획서와 구현 전제는 삭제하거나 역사 문서로 명확히 표시한다.
동일 기능의 상충하는 설명을 남기지 않는다.

## 8. 완료 기준

다음 조건을 모두 충족해야 완료로 보고한다.

- engine-backed DOCX 격차 14개가 HWPX REST와 MCP에서 실제 동작
- 변경 내용 추적이 실제 HWPX 표현으로 구현되거나, 표준·한컴 증거로 불가능
  판정되어 일반 replace와 명확히 분리됨
- 구조 명령의 atomic save와 package 보존 회귀 통과
- RHWP native PDF endpoint 실제 동작
- 프로젝트 편집기와 한컴오피스 2024 실제 검수 증거 확보
- 총 250개 평가의 사례별 결과와 전체 scorecard 생성
- 시작한 서버, child process, 한컴 프로세스와 임시 자원 정리 확인
- 공개 문서와 실제 catalog/API/MCP가 일치

완료 보고는 정적 코드, 자동 테스트, REST/MCP 실행, 프로젝트 편집기 렌더,
한컴오피스 검수 결과를 서로 구분해 제시한다.
