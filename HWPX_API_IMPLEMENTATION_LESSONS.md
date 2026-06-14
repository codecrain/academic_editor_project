# HWPX API-only 편집 엔진 개선 노하우 보고서

작성일: 2026-06-13

## 1. 결론

이번 개선의 핵심 결론은 단순하다. HWPX 편집은 "문서를 열 수 있다"와 "사용자가 보는 최종 서식을 보존하며 수정할 수 있다"가 완전히 다르다. 처음에는 RHWP로 열리고 일부 텍스트가 보인다는 사실만으로 편집 가능성을 판단했지만, 실제로는 저장 방식, 원본 패키지 보존, 표/문단/그림 객체의 정확한 위치 지정, 저장 후 재오픈, 시각 렌더 검증이 모두 필요했다.

현재는 API-only로 다음이 가능하다.

- HWPX를 LLM-friendly JSON으로 읽는다.
- 문단/표/셀/이미지 타깃을 찾고 검사한다.
- 특정 셀/문단 내용을 바꾼다.
- 원본 셀 또는 문단의 paragraph/run style id를 재사용한다.
- 셀 외곽 스타일(border/fill/margin/vertical align)을 복제한다.
- 임베디드 이미지를 교체하거나 단순 PNG 차트 이미지를 생성해 교체한다.
- 저장 후 RHWP로 다시 열어 page/table/paragraph/object 수와 주요 값을 검증한다.

아직 완성되지 않은 영역도 명확하다.

- 새 charPr/paraPr 정의를 안정적으로 생성해 preserve-package 저장에 반영하는 것은 아직 제한적이다.
- 진짜 HWPX numbering/list 객체 생성은 제한적이고, 현재 `list.applyNumbering`은 텍스트 번호와 기존 스타일 복제 중심이다.
- sample 문서의 차트는 `chart` 객체가 아니라 PNG 이미지이므로 chart data API가 아니라 image replacement가 맞다.
- 사람이 보는 "완벽한 최종 보고서"를 보장하려면 render-compare와 Hancom reopen/PDF 검증까지 품질 게이트에 포함해야 한다.

## 2. 시작점의 문제

초기 상태는 다음 문제가 겹쳐 있었다.

- HWPX 저장은 베타로 막혀 있었고 "깨질 수 있다"는 경고가 있었다.
- RHWP 원본 소스가 프로젝트 안에 명확히 통합되어 있지 않았다.
- `npm run dev`가 없거나 docx/hwpx가 함께 뜨는 구조가 아니었다.
- DOCX와 HWPX 코드 경계가 불명확했다.
- HWPX를 `exportHwpx()`로 다시 저장하면 sample 문서에서 page/table/paragraph 구조가 바뀌는 문제가 있었다.
- API-only 작성 시 처음에는 문서 끝에 append하는 수준에 가까웠고, 원본의 표/문단/서식을 정확히 수정하지 못했다.
- LLM이 사용할 API 문서가 "무슨 기능이 있다" 수준이었고, 어느 위치에 어떤 파라미터로 적용해야 하는지 불명확했다.

이 상태에서는 아무리 긴 내용을 생성해도 "문서 편집"이 아니라 "깨진 출력물 생성"에 가까웠다.

## 3. 개선 흐름

### 3.1 소스 구조 정리

DOCX와 HWPX를 같은 런타임 묶음이 아니라 별도 코드 영역으로 분리했다.

- DOCX: `editor_docx`
- HWPX: `editor_hwpx`

프로젝트 루트의 `npm run dev`와 관련 스크립트에서 두 에디터가 함께 설치/실행될 수 있도록 정리했다. 이 분리는 라이선스, 빌드, 디버깅, 배포 판단을 단순하게 만들었다.

### 3.2 RHWP export 저장 포기, preserve-package로 전환

가장 중요한 전환점은 HWPX 저장 전략이다.

처음에는 RHWP의 `exportHwpx()`를 그대로 쓰는 방향을 검토했지만, sample 문서에서 no-edit export만 해도 구조가 달라졌다. 따라서 제품 기능의 기본 저장 방식으로는 부적합했다.

현재 기본 전략은 `preserve-package`다.

- 원본 HWPX ZIP 패키지를 그대로 읽는다.
- 수정 대상인 `Contents/sectionN.xml` 또는 `BinData/*`만 패치한다.
- 수정하지 않은 XML, 이미지, manifest, header는 원본 그대로 유지한다.
- 저장 후 다시 열어 page/table/paragraph/object 수를 검증한다.

이 방식이 ESG 양식과 sample 보고서에서 구조 보존의 기반이 됐다.

### 3.3 읽기 API 강화

단순 텍스트 추출만으로는 LLM이 정확히 수정할 수 없었다. 그래서 `readJson()` 출력에 다음을 포함했다.

- `blocks`: 문단 단위 텍스트와 native anchor
- `tables[].cells[]`: cellIndex, row, col, text, location
- `style`: 셀/문단/run 스타일
- `styleFingerprint`: style drift 비교용 hash와 basis
- `layout.capacity`: 셀 안에 들어갈 수 있는 글자량 추정
- `objectGraph`: 이미지, 그림, chart-like object
- `editableTargets`: 안전하게 수정 가능한 paragraph/cell 타깃과 allowed actions

이후 LLM 작업 흐름은 `read -> locate -> inspect -> apply -> check`로 바뀌었다.

### 3.4 표/문단 쓰기 안정화

처음에는 `setCellText`와 `replaceParagraphText`만 있었다. 이후 다음 안정화를 추가했다.

- 같은 셀을 여러 번 쓰면 마지막 명령만 반영되도록 중복 패치 정리
- 표가 들어 있는 상위 문단을 `replaceParagraphText`로 수정해도 표가 지워지지 않도록 보호
- 셀 내부 줄바꿈은 HWPX `hp:p` 여러 개로 재생성
- 기존 셀의 첫 paragraph/run style을 기본 템플릿으로 사용
- `fitText`로 긴 텍스트의 줄 길이와 overflow 위험을 사전 계산

이 단계에서 ESG 양식 채우기는 구조적으로 안정화됐다.

### 3.5 스타일 복제 추가

sample 보고서 품질이 낮았던 큰 이유는 "값은 들어갔지만 그 값이 원본 서식처럼 보이지 않는 것"이었다.

그래서 다음 기능을 추가했다.

- `style/fingerprint`
- `table.writeRichCell`
- `style.clone`
- `paragraphStyleIds(location)`
- `cellTemplateParagraphXml(location)`

원리는 새 스타일을 생성하지 않고, 원본 문서 안에 이미 존재하는 `paraPrIDRef`, `styleIDRef`, `charPrIDRef`를 source location에서 읽어 target에 적용하는 방식이다.

이 방식은 한계가 있지만 안정성이 높다. 새 style pool을 잘못 만들지 않기 때문이다.

### 3.6 객체/이미지 API 추가

sample 문서는 chart처럼 보이는 요소가 실제 chart XML이 아니라 PNG 이미지로 들어 있었다. 따라서 chart data API를 억지로 설계하는 것은 맞지 않았다.

추가한 기능은 다음이다.

- `object/inventory`: package image, picture control, chart control 목록 확인
- `object.replaceImage` / `image.replace`: 기존 이미지 bytes 교체
- `image.generateAndReplace`: 순수 JS로 단순 PNG bar image 생성 후 기존 PNG package entry 교체

이로써 "문서 안에 차트가 있는가"가 아니라 "그 차트가 실제 chart object인가, image인가"를 먼저 판단하는 흐름이 생겼다.

### 3.7 이번 추가 개선

이번 작업에서 추가한 고수준 API는 다음이다.

- `style.applyText`: 기존 텍스트 또는 새 텍스트에 source style id 적용
- `paragraph.applyStyle`: 문단/셀 내부 문단의 style id만 적용
- `list.applyNumbering`: 번호형 텍스트 목록 작성, 기존 numbered style source 재사용 가능
- `table.applyCellStyle`: 셀 외곽 border/fill/margin/vertical align 복제 또는 명시 적용
- `image.generateAndReplace`: 단순 PNG 생성 후 기존 PNG 교체

중요한 내부 수정도 있었다.

- `styleIds` merge 시 `undefined`가 source style을 덮어쓰는 버그를 수정했다.
- `cellStyle` merge 시 빈 margin이 source margin을 지우는 버그를 수정했다.
- 새 명령을 `allowedActions`에 반영해 LLM이 타깃별 가능 작업을 알 수 있게 했다.
- sample 작성 스크립트에서 `paragraph.applyStyle`, `table.applyCellStyle`을 실제 사용하도록 바꿨다.

## 4. 검증한 것

이번 작업 후 실행한 검증:

- `node --check editor_hwpx/scripts/hwpx-api-utils.mjs`
- `node --check editor_hwpx/scripts/hwpx-api-utils.test.mjs`
- `node --check editor_hwpx/scripts/author-sample-report-api-preserve.mjs`
- `npm.cmd run test:hwpx-api`
- `npm.cmd run hwpx:fill:esg`
- `npm.cmd run hwpx:author:sample`

최종 테스트 결과:

- HWPX API 단위/회귀 테스트: 14/14 통과
- ESG 작성: 통과, pageCount 2 유지, tableCount 4 유지
- sample 작성: 통과, pageCount 10 유지, tableCount 15 유지, paragraphCount 85 유지
- sample command count: 295
- sample object summary: image 7, picture 7, chart 0

남은 경고:

- `LinesegTextRunReflow` 경고가 남아 있다.
- 이 경고는 저장 실패는 아니지만, 렌더러가 한컴 textRun reflow에 의존하는 영역이 있음을 뜻한다.
- 최종 제품 품질 게이트에서는 render-compare 또는 Hancom PDF 검증과 함께 봐야 한다.

## 5. 현재 API로 가능한 실무 작업

API-only로 가능한 작업:

- 공모 신청서처럼 정해진 HWPX 표 양식 채우기
- 기존 셀의 서식을 복제해 값 입력
- 표의 분석 의견 박스에 긴 텍스트 작성
- 문단 제목/본문 스타일을 nearby source에서 복제
- embedded PNG 차트 이미지를 교체
- 저장 후 구조 검증

API-only로 아직 위험한 작업:

- 완전히 새 문서 레이아웃을 HWPX로 고품질 생성
- 새 폰트 정의, 새 paragraph style, 새 numbering definition을 preserve-package 방식으로 안정 생성
- chart XML 데이터 직접 수정
- 한컴에서 보는 결과와 RHWP 렌더 결과의 100% 일치 보장
- 복잡한 다단, floating object, header/footer까지 포함한 대규모 재배치

## 6. 다음 LLM에게 주는 작업 규칙

HWPX를 API로 수정할 때는 반드시 이 순서를 지켜야 한다.

1. `readJson()`으로 전체 구조를 읽는다.
2. `targetMap()`에서 가능한 paragraph/cell target을 확인한다.
3. 수정할 target마다 `inspectTarget()`을 호출한다.
4. merged table이면 row/column보다 `cell.number`를 사용한다.
5. 서식이 중요하면 가까운 source cell/paragraph를 정한다.
6. 긴 텍스트는 `fitText()` 또는 `fit: true`를 사용한다.
7. `commands/apply`는 commandId를 모두 붙인다.
8. 저장 후 새 `HwpxApiSession(saved.bytes)`로 다시 연다.
9. page/table/paragraph/object count와 주요 값을 비교한다.
10. 납품 산출물은 render-compare까지 수행한다.

하지 말아야 할 것:

- 문서 끝에 append한 뒤 성공이라고 판단하지 않는다.
- 텍스트 검색 결과 하나만 믿고 바로 수정하지 않는다.
- row/column만으로 merged cell을 수정하지 않는다.
- chart처럼 보인다고 chart API를 먼저 쓰지 않는다. `objectInventory()`로 실제 객체 타입을 확인한다.
- 새 style id를 임의로 추측하지 않는다.

## 7. 의사결정 제안

제품 방향은 계속 진행할 가치가 있다. 다만 목표를 정확히 나눠야 한다.

단기 목표:

- 정해진 HWPX 양식 채우기
- 기존 서식 source를 활용한 표/문단 수정
- 이미지 기반 차트 교체
- 구조 보존 저장과 품질 리포트

중기 목표:

- render-compare 자동화
- 새 charPr/paraPr 생성을 preserve-package에 안정 반영
- 진짜 HWPX numbering/list object 생성
- header/footer/footnote/endnote edit target 확장

장기 목표:

- Hancom Automation을 optional oracle로 연결해 reopen/PDF 검증
- RHWP renderer와 Hancom PDF 결과 차이를 fixture별로 줄이기
- chart XML이 있는 문서는 chart data API, 이미지 차트 문서는 image API로 자동 분기

현재 판단:

API는 "텍스트 입력 도구"에서 "원본 서식 보존형 HWPX 편집 엔진의 초기 형태"까지 올라왔다. 하지만 "어떤 HWPX든 완벽한 보고서로 자동 작성" 수준은 아니다. 그 수준으로 가려면 style pool 생성, list object 생성, render diff, Hancom validation이 다음 핵심 작업이다.

## 8. 관련 파일

- API utility: `editor_hwpx/scripts/hwpx-api-utils.mjs`
- API tests: `editor_hwpx/scripts/hwpx-api-utils.test.mjs`
- ESG fixture writer: `editor_hwpx/scripts/fill-esg-api-preserve.mjs`
- Sample report writer: `editor_hwpx/scripts/author-sample-report-api-preserve.mjs`
- LLM API spec: `API.md`
- ESG output: `output/hwpx-review/api-preserve/01-esg-original.api-preserve-filled.hwpx`
- Sample output: `output/hwpx-review/sample-report-api-preserve/sample-input.api-preserve-authored.hwpx`
