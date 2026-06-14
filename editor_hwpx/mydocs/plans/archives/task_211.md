# Task 211 수행계획서

## 제목
kps-ai.hwp p61 비-인라인 이미지 셀 밖 렌더링 (B-012)

## 현상
- **파일**: kps-ai.hwp, 61페이지 ("개인정보 수집·이용·제공 동의 양식")
- **구조**: 표 > 셀(세로 가운데 정렬) > 여러 중첩 표 + 비-인라인 이미지
- **문제**: 셀 내 비-인라인 이미지(text_wrap=1, vert_rel=Para)의 y좌표(para_y=1114.94)가 셀 clip 영역(y=724~905)을 초과하여 이미지가 화면에 표시되지 않음
- **한컴 동작**: 이미지가 셀 내부에 정상적으로 표시됨

## 원인 분석

### 핵심 문제
외곽 셀의 콘텐츠 높이 계산과 세로 가운데 정렬 로직에서 비-인라인 이미지의 높이를 올바르게 처리하지 못함.

### 구조 설명
```
외곽 표 > 셀 (vertical_align=Center)
  ├─ 중첩 표 A
  ├─ 중첩 표 B
  ├─ 비-인라인 이미지 (text_wrap=1, vert_rel=Para)
  └─ 중첩 표 C
```

### 문제 흐름
1. `total_content_height` 계산 (table_layout.rs ~L987-1036):
   - `calc_composed_paras_content_height()` + 중첩 표 높이 + 비-인라인 이미지 높이를 합산
   - 하지만 `calc_composed_paras_content_height()`가 LINE_SEG 기반이며, LINE_SEG에 이미 중첩 표 높이가 포함되어 있을 수 있음 → 이중 계산 가능성

2. height_measurer.rs의 셀 높이 측정 (L443):
   - `content_height = text_height` — "LINE_SEG에 이미 중첩 표 높이 반영" 주석
   - 비-인라인 이미지 높이가 여기에 반영되지 않을 수 있음

3. 비-인라인 이미지 배치 (table_layout.rs ~L1212-1222):
   - `para_y` 기준으로 y좌표 설정
   - `para_y += pic_h`로 다음 콘텐츠 위치 갱신
   - 세로 가운데 정렬의 mechanical_offset이 적용된 `text_y_start`에서 시작하지만, 이전 콘텐츠(표 등)가 많으면 para_y가 셀 경계를 넘음

4. 셀의 실제 높이(cell_h)는 HWP 파일에 기록된 고정값이거나 height_measurer가 산정한 값 → 비-인라인 이미지 높이 미반영 시 셀이 작게 잡힘

### 핵심 조사 포인트
- height_measurer에서 비-인라인 이미지를 셀 높이에 반영하는지
- `total_content_height`와 실제 셀 높이(cell_h) 간의 불일치
- LINE_SEG가 비-인라인 이미지 높이를 포함하는지 여부

## 수정 방안 (예상)
1. height_measurer에서 비-인라인 이미지 높이를 셀 content_height에 포함
2. table_layout의 total_content_height 계산과 height_measurer 로직 일치시키기
3. 셀 clip 영역이 실제 콘텐츠를 모두 포함하도록 보정

## 영향 범위
- 셀 내부에 비-인라인 이미지가 있고 세로 가운데/아래 정렬인 모든 경우
- 기존 Top 정렬 셀은 영향 적음 (mechanical_offset=0)

## 검증 방법
1. `cargo test` — 기존 테스트 PASS 확인
2. SVG export로 kps-ai.hwp p61 시각적 확인 (이미지 표시 여부)
3. E2E 테스트로 웹 렌더링 확인
