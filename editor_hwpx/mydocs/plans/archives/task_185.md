# 타스크 185: hwpp-001.hwp 문단 페이지 넘김 버그 수정

## 1. 문제 요약

`samples/hwpp-001.hwp` 문서에서 다수의 페이지에서 문단/표가 편집 용지 영역(body area)을 초과하여 렌더링됩니다. 11페이지(page_num=6)뿐 아니라 전체 66페이지 중 약 30개 이상의 overflow가 발견되었습니다.

## 2. 근본 원인

**HeightMeasurer의 `total_height`와 layout 실제 렌더링 높이 불일치**

| 구분 | 계산 방식 | 비고 |
|------|-----------|------|
| HeightMeasurer | `spacing_before + Σ(line_height + line_spacing) + spacing_after` | 고정값 |
| Pagination | HeightMeasurer의 `total_height`를 그대로 사용 | `current_height += para_height` |
| Layout (렌더링) | `spacing_before`(조건부) + 실제 줄 렌더링 + `spacing_after` | column top이면 sp_before 생략 |

### 구체적 차이점

디버그 추적 결과 (page_idx=3, 구역 1):
- HeightMeasurer가 `total_height=21.33` (sp_before=16.00, lines=5.33)로 측정한 문단을 layout이 `delta=34.13`으로 렌더링
- 누적 차이가 **76.80px**에 달하여 마지막 2-3개 문단이 body area(930.51px)를 초과
- 이 패턴이 문서 전체에서 반복 발생

### 불일치 원인 추정

1. **HeightMeasurer가 composed line 정보와 실제 layout이 사용하는 line 정보가 다름**
   - HeightMeasurer의 `lines=5.33`(400 HWPUNIT)은 빈 줄 높이인데, layout은 `34.13`을 렌더링
   - composed 데이터와 raw line_segs 데이터 간 불일치 가능성

2. **쪽나눔(구역 경계) 후 layout에서 추가 간격이 발생**
   - 한컴에서 쪽나눔 시 편집 용지가 새 페이지에서 시작
   - layout의 vpos 기반 보정이 page_index==0에서만 동작 (line 810)하여 후속 페이지에서 높이 보정 누락

3. **표(Table) 문단의 spacing 이중 적용 가능성**
   - layout_column_item에서 표 문단의 spacing_before를 별도 추가 (line 892-894)
   - pagination이 이를 정확히 반영하지 못함

## 3. 영향 범위

- `samples/hwpp-001.hwp` 66페이지 중 약 20개 이상 페이지에서 overflow 발생
- FullParagraph, PartialParagraph, Table, PartialTable 모두 영향
- 다른 HWP 파일에서도 동일 패턴 발생 가능

## 4. 수정 방향

HeightMeasurer의 높이 측정과 layout의 실제 렌더링 높이를 일치시킨다. 구체적으로:

1. HeightMeasurer가 사용하는 line 데이터와 layout이 사용하는 line 데이터가 동일한지 검증
2. 표 문단의 spacing 처리를 pagination과 layout 간 통일
3. vpos 기반 보정의 page_index==0 제한 재검토

## 5. 검증 방법

- `samples/hwpp-001.hwp` 전체 SVG 내보내기 후 overflow 검출 (body area 초과 문단 0개)
- 기존 테스트 657개 전체 통과
- WASM 빌드 후 웹 브라우저에서 페이지 렌더링 확인
