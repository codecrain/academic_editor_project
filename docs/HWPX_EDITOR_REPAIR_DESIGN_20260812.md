# HWP/HWPX 편집 신뢰성 보완 설계 (2026-08-12)

## 범위와 완료 기준

이 설계는 제안서 B의 내용을 다시 작성하는 작업이 아니라, 그 작업을 막은 Academic Editor의 재현 가능한 결함을 수정한다. 완료 판정은 명령 반환 성공이 아니라 `명령 → 저장 → 재열기 → 구조 재검사 → 전 페이지 렌더 → MCP 응답` 전 경로의 의미 보존을 기준으로 한다.

## 확정된 근본 원인

### P0-1. 바이너리 HWP 셀의 다중 문단 서식 붕괴

`table.writeCell`은 HWP에서 기존 셀 문단을 전부 첫 문단으로 병합한 뒤 다시 분할했다. `paragraphTemplateIndices`는 HWPX XML 패치에만 전달되고 HWP 네이티브 편집에는 전달되지 않았다. 결과적으로 빈 첫 문단의 3pt 문자 속성과 첫 문단 정렬이 새 문단 전체에 복제됐다. 속성 JSON을 다시 적용하는 방식도 단위 변환으로 여백과 간격을 변형하므로 손실 없는 복원이 아니다.

설계:

- 쓰기 전에 각 원본 셀 문단의 `styleId`, `paraShapeId`, `charShapeId`를 캡처한다.
- 텍스트 재구성 뒤 `paragraphTemplateIndices`가 가리키는 기존 스타일 ID 세트를 네이티브 단일 연산으로 복원한다.
- 속성값으로 새 스타일을 파생 생성하지 않는다.
- 템플릿 ID가 없거나 범위를 벗어나면 서식을 추측하지 않고 명시적으로 실패한다.
- HWP 저장 후 재열기한 각 문단의 문자·문단 속성을 원본 템플릿과 비교한다.

### P0-2. `table.autoFit`의 문서 전체 페이지 회귀 미검출

기존 검증은 후보 문서의 셀 클립 수가 증가했는지만 확인했다. 수백 행의 높이가 조금씩 늘면서 17쪽이 30쪽으로 증가하거나 빈/저점유 페이지가 생겨도 클립 수만 줄면 커밋됐다.

설계:

- 원자 배치 전후를 모두 렌더해 페이지 수, 빈 페이지 수, 저점유 페이지 수, 셀 클립 수를 측정한다.
- 기본 예산은 `maxPageGrowth=1`, `maxBlankPageGrowth=0`, `maxLowOccupancyGrowth=0`이다.
- 완화가 필요하면 명령에 명시한 예산만 사용하며, 배치 안의 여러 auto-fit 명령 중 가장 엄격한 값을 적용한다.
- 초과 시 전체 배치를 `HWPX_AUTOFIT_PAGINATION_REGRESSION`으로 롤백하고 전후 측정값과 delta를 반환한다.
- 클립 증가 오류는 기존 `HWPX_AUTOFIT_RENDER_CLIPPING_REGRESSION`을 유지하되 동일한 전후 스냅샷을 첨부한다.

### P0-3. 렌더 클립 오류와 편집 대상의 연결 부재

기존 `render-cell-clip`은 `cell-clip-N`과 좌표만 반환했다. 문서 구조의 어느 표·셀인지 알 수 없어 LLM이 SVG를 다시 파싱하거나 주변 텍스트로 추측해야 했다.

설계:

- SVG 셀 클립과 클립 그룹에 `section`, `paragraph`, `control`, `cell-index`, `row`, `column` 출처를 기록한다.
- SVG 증거 분석기는 이 값을 `provenance`로 구조화한다.
- 서버 품질 검사는 현재 JSON 구조와 결합해 `targetId`, `tableId`, `location`을 `render-cell-clip`에 직접 포함한다.
- 중첩 표에서도 렌더 트리의 현재 table ancestry를 사용해 가장 가까운 표를 기록한다.

## API/MCP 복잡도 원칙

- 기존 `table.writeCell`, `table.autoFit`, `review` 계약을 확장한다. 같은 기능의 새 도구나 별도 래퍼를 추가하지 않는다.
- 파일 형식별 구현은 달라도 저장 후 의미 계약은 같아야 한다.
- 자동 맞춤은 자동 페이지 미화 기능으로 과장하지 않는다. 행 성장 명령이며 문서 수준 회귀 예산을 통과해야 한다.
- 렌더 증거는 별도 SVG 해석 도구를 요구하지 않고 기존 review 결과에 결합한다.

## 후속 설계 항목

다음 항목은 이번 P0 수정과 별개로 계약을 더 넓히기 전에 독립적인 재현 fixture가 필요하다.

1. 표 삭제 후 ordinal 기반 `tbl_N` 재사용 문제: baseline table에 영속 lineage ID와 삭제 tombstone을 추가한다.
2. 명시적 `pageBreakBefore`로 생긴 제목 단독 페이지: 페이지 흐름 증거에 원인 문단 target과 인접 break chain을 포함한다.
3. 실제 글리프 경계 근처의 클립 오탐: 고정 tolerance를 늘리기 전에 폰트별 ascent/descent fixture로 참/거짓 클립을 분리한다.

다중 문단 셀의 서식 대상 모호성은 이번 구현에 포함했다. `character`/`paragraph` 범위 또는 같은 성격의 스타일 명령은 `cellParagraphIndex`가 없고 셀에 문단이 둘 이상이면 `HWPX_CELL_PARAGRAPH_INDEX_REQUIRED`로 원자 배치를 거부한다.

## 레드팀 검수 행렬

| 영역 | 정상 | 적대 조건 | 저장·재열기 판정 |
|---|---|---|---|
| HWP 셀 쓰기 | 서로 다른 4개 문단 템플릿 유지 | 빈 문단, 재정렬된 template index, 잘못된 index | 텍스트와 문단별 paragraph/character format 일치 |
| HWPX 셀 쓰기 | 기존 XML 템플릿 유지 | 탭, 줄바꿈, 이미지 포함 셀 | 패키지 보존 및 그림 placement 유지 |
| auto-fit | 필요한 최소 행 성장 | 페이지 증가, 빈 페이지, 저점유 페이지, 새 클립 | 예산 초과 전체 롤백, revision 불변 |
| 렌더 출처 | 일반 표 셀 | 분할 표, 중첩 표, 같은 문단의 복수 표 | provenance와 현재 targetId/location 결합 |
| MCP | catalog/inspect/edit/review/save | 잘못된 예산, stale revision, 검수 실패 | 구조화 오류, 저장 차단, 재열기 receipt |
