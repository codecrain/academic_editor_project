# 타스크 155: 표/셀 속성 대화상자 기본 탭 전면 개편

> **작성일**: 2026-02-23
> **우선순위**: P1
> **상태**: 완료

---

## 1. 문제 정의

### 1-1. 현상

표/셀 속성 대화상자의 "기본" 탭이 한컴 한글 워드프로세서와 크게 다르다.

- "글자처럼 취급" 체크박스가 항상 disabled + checked로 하드코딩
- 본문과의 배치 (어울림/자리차지/글뒤로/글앞으로) 버튼이 비활성 전용
- 가로/세로 위치 설정 (기준/정렬/오프셋) UI 자체가 없음
- 쪽 영역 안으로 제한, 서로 겹침 허용, 조판부호 동기 옵션 없음
- 개체 회전, 기울이기, 기타 섹션 없음
- 백엔드 API에서 위치 관련 속성을 노출하지 않아 읽기/쓰기 불가

### 1-2. 원인

- `get_table_properties_native()`/`set_table_properties_native()`에 `table.attr` 비트 필드의 위치 관련 값과 `raw_ctrl_data`의 오프셋 값이 포함되어 있지 않음
- 프론트엔드 `TableProperties` 타입에 위치 관련 필드 미정의
- `buildBasicTab()`에서 위치/배치 UI를 읽기 전용 스텁으로만 구현

### 1-3. 목표

한컴 한글 워드프로세서의 표/셀 속성 대화상자 기본 탭과 동일한 UI를 구현하여 사용자 경험의 일관성을 유지한다.

---

## 2. 데이터 모델

### 2-1. table.attr 비트 필드 (CommonObjAttr와 동일 레이아웃)

| 비트 | 필드 | 값 |
|------|------|----|
| 0 | treat_as_char | 0=쪽배치, 1=글자처럼 |
| 3-4 | vert_rel_to | 0=Paper, 1=Page, 2=Para |
| 5-7 | vert_align | 0=Top, 1=Center, 2=Bottom, 3=Inside, 4=Outside |
| 8-9 | horz_rel_to | 0=Paper, 1=Page, 2=Column, 3=Para |
| 10-12 | horz_align | 0=Left, 1=Center, 2=Right, 3=Inside, 4=Outside |
| 13 | restrict_in_page | 쪽 영역 안으로 제한 |
| 14 | allow_overlap | 서로 겹침 허용 |
| 21-23 | text_wrap | 0=Square(어울림), 1=TopAndBottom(자리차지), 2=BehindText(글뒤로), 3=InFrontOfText(글앞으로) |

### 2-2. table.raw_ctrl_data 레이아웃 (ctrl_data[4..] 이후)

| 오프셋 | 크기 | 필드 |
|--------|------|------|
| 0-3 | i32 | vertical_offset |
| 4-7 | i32 | horizontal_offset |
| 8-11 | u32 | width |
| 12-15 | u32 | height |
| 20-21 | i16 | outer_left |
| 22-23 | i16 | outer_right |
| 24-25 | i16 | outer_top |
| 26-27 | i16 | outer_bottom |
| 32-35 | i32 | prevent_page_break (개체와 조판부호 동기) |

---

## 3. 구현 계획

### 3-1단계: 백엔드 — 위치 속성 전체 노출

**파일: `src/document_core/commands/table_ops.rs`**

- `get_table_properties_native()`: attr 비트에서 11개 위치 속성 추출 후 JSON에 포함
  - treatAsChar, textWrap, vertRelTo, vertAlign, horzRelTo, horzAlign (attr 비트)
  - vertOffset, horzOffset (raw_ctrl_data[0..8])
  - restrictInPage, allowOverlap (attr bit 13, 14)
  - keepWithAnchor (raw_ctrl_data[32..36])

- `set_table_properties_native()`: 11개 필드 쓰기 처리
  - 문자열 → 비트값 변환 후 attr 비트 마스킹
  - i32 오프셋 → raw_ctrl_data 바이트 직접 쓰기

### 3-2단계: 프론트엔드 — TableProperties 타입 확장

**파일: `rhwp-studio/src/core/types.ts`**

TableProperties 인터페이스에 11개 필드 추가:
- treatAsChar, textWrap, vertRelTo, vertAlign, horzRelTo, horzAlign
- vertOffset, horzOffset
- restrictInPage, allowOverlap, keepWithAnchor

### 3-3단계: 프론트엔드 — 기본 탭 UI 전면 개편

**파일: `rhwp-studio/src/ui/table-cell-props-dialog.ts`**

picture-props-dialog.ts의 기본 탭 패턴을 참조하여 구현.

UI 구조 (한컴과 동일):
```
┌─ 크기 ─────────────────────────────────┐
│ 너비: [____] mm   높이: [____] mm       │ (읽기 전용)
└────────────────────────────────────────┘
┌─ 위치 ─────────────────────────────────┐
│ ☑ 글자처럼 취급                          │
│ ┌─ 본문과의 배치 그룹 (posGroup) ──────┐ │
│ │ [어울림] [자리차지] [글뒤로] [글앞으로] │ │
│ │ 가로: [종이▼]의 [왼쪽▼] 기준 [__] mm │ │
│ │ 세로: [종이▼]의 [위▼]   기준 [__] mm │ │
│ │ ☑ 쪽 영역 안으로 제한                 │ │
│ │ ☐ 서로 겹침 허용                      │ │
│ │ ☐ 개체와 조판부호를 항상 같은 쪽에 놓기 │ │
│ └──────────────────────────────────────┘ │
└────────────────────────────────────────┘
┌─ 개체 회전 ────────────────────────────┐
│ 회전각: [____]° (비활성)                 │
└────────────────────────────────────────┘
┌─ 기울이기 ─────────────────────────────┐
│ 가로: [____]° 세로: [____]° (비활성)     │
└────────────────────────────────────────┘
┌─ 기타 ─────────────────────────────────┐
│ 번호 종류: [표▼] (비활성)                │
└────────────────────────────────────────┘
```

핵심 동작:
- "글자처럼 취급" 체크 → posGroup 그룹에 `.disabled` CSS 클래스 토글 → 비활성
- "글자처럼 취급" 해제 → posGroup 활성화

CSS: `.dialog-pos-group.disabled { opacity: 0.5; pointer-events: none; }`

---

## 4. 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `src/document_core/commands/table_ops.rs` | get/set에 11개 위치 속성 추가 |
| `rhwp-studio/src/core/types.ts` | TableProperties에 11개 필드 추가 |
| `rhwp-studio/src/ui/table-cell-props-dialog.ts` | buildBasicTab() 전면 재작성 + helper 메서드 + populateFields/onConfirm 확장 |
| `rhwp-studio/src/styles/dialogs.css` | `.dialog-pos-group.disabled` 규칙 추가 |

## 5. 참조

| 파일 | 참조 내용 |
|------|----------|
| `rhwp-studio/src/ui/picture-props-dialog.ts` | 기본 탭 위치 UI 패턴 (wrapBtns, posDetailEls, updatePositionVisibility) |
| `src/parser/control/shape.rs` | CommonObjAttr 비트 파싱 로직 |
| `src/model/shape.rs` | VertRelTo, HorzRelTo, VertAlign, HorzAlign, TextWrap 열거형 정의 |

## 6. 검증

1. `docker compose --env-file .env.docker run --rm test` — 608 테스트 통과
2. `docker compose --env-file .env.docker run --rm wasm` — WASM 빌드 성공
3. UI 확인:
   - 기본 탭에서 한컴과 동일한 레이아웃
   - "글자처럼 취급" 체크 → 본문배치 그룹 비활성 (opacity 0.5)
   - "글자처럼 취급" 해제 → 본문배치 그룹 활성
   - 본문과의 배치 버튼 선택 시 active 표시
   - 가로/세로 위치 설정값 저장/로드 정상
   - UI → WASM → Rust IR 전체 데이터 흐름 검증 완료

## 7. 결과

- **커밋**: `9378be0` 기본 탭 전면 개편 + `eef7cc4` 상태 갱신
- **변경량**: 4파일, +296 / -23 lines
- **테스트**: 608 통과, WASM 빌드 성공
