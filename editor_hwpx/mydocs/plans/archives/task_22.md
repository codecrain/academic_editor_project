# 타스크 22: 텍스트 리플로우 및 문단 분리 (B-308)

## 수행계획서

### 1. 개요

현재 `insert_text_at()` / `delete_text_at()`은 `line_segs.text_start`를 단순 시프트만 하고, 줄 바꿈을 재계산하지 않는다. HWP 파일에서 읽어온 원래의 줄 바꿈 정보를 편집 후에도 그대로 사용하기 때문에, 텍스트 삽입/삭제 후 줄 바꿈이 부정확해진다.

또한 Enter 키는 `\n` 삽입이 아닌 **문단 분리**(새 Paragraph 생성)로, Backspace(문단 시작)는 **문단 병합**(이전 문단과 합치기)으로 처리해야 한다.

### 2. 목표

1. **텍스트 리플로우**: 텍스트 편집 후 `line_segs`를 컬럼 너비 기반으로 재계산
2. **문단 분리 (Enter)**: 캐럿 위치에서 문단을 둘로 분할
3. **문단 병합 (Backspace@시작)**: 현재 문단을 이전 문단에 병합

### 3. 현재 아키텍처 분석

#### 핵심 파이프라인
```
텍스트 편집 → insert_text_at()/delete_text_at()
           → compose_section() [line_segs 기반 줄 분할]
           → paginate() [페이지 분할]
           → renderCurrentPage() [렌더링]
```

#### 문제점
- `compose_section()`은 `line_segs`의 `text_start` 값을 그대로 사용하여 줄을 분할
- 편집 후 `line_segs`는 단순 시프트만 되어 있어, 실제 텍스트 너비와 컬럼 너비에 맞는 줄 바꿈이 아님
- **필요한 것**: 편집 후 `line_segs`를 동적으로 재계산하는 리플로우 엔진

#### 사용 가능한 자원
- `estimate_text_width()`: 텍스트 너비 추정 (CJK=font_size, Latin=font_size*0.5)
- `PageLayoutInfo.column_areas[0].width`: 컬럼 너비 (px)
- `ResolvedStyleSet`: 문단/글자 스타일 정보
- `ResolvedParaStyle.margin_left/margin_right/indent`: 문단 여백
- `CharShapeRef → ResolvedCharStyle.font_size/ratio`: 글자별 스타일

### 4. 구현 단계

---

#### 1단계: line_segs 재계산 (리플로우 엔진)

**목표**: `Paragraph`의 `line_segs`를 텍스트 내용과 컬럼 너비에 맞게 재계산하는 함수

**파일**: `src/renderer/composer.rs`

- `reflow_line_segs()` 함수 추가
  - 입력: `&mut Paragraph`, 컬럼 너비(px), `&ResolvedStyleSet`
  - 처리: 텍스트를 처음부터 순회하며, 각 글자의 너비를 누적하고 컬럼 너비 초과 시 줄 바꿈
  - `CharShapeRef` 경계에서 스타일 변경 반영
  - 문단 여백(margin_left, margin_right, indent) 반영
  - 결과: `line_segs`를 새로 생성하여 `paragraph.line_segs`에 대입
  - LineSeg의 `line_height`, `baseline_distance`, `line_spacing` 등은 해당 줄의 CharShape에서 결정

- WASM API 수정 (`src/wasm_api.rs`)
  - `insert_text_native()` / `delete_text_native()`에서 `compose_section()` 호출 전에 `reflow_line_segs()` 호출
  - 컬럼 너비는 `PageLayoutInfo`에서 가져옴

**테스트**:
- 짧은 텍스트 → 1줄
- 긴 텍스트 → 2줄 이상
- 스타일 변경 경계에서의 정확한 줄 바꿈
- 문단 여백 반영

---

#### 2단계: 문단 분리 (Enter → splitParagraph)

**목표**: 캐럿 위치에서 문단을 둘로 분할하는 API

**파일**: `src/model/paragraph.rs`, `src/wasm_api.rs`

- `Paragraph.split_at()` 메서드 추가
  - 입력: `char_offset` (분할 위치)
  - 반환: 새 `Paragraph` (분할 위치 이후의 텍스트/메타데이터)
  - 원본 문단은 분할 위치 이전까지만 유지
  - 분할되는 메타데이터: text, char_offsets, char_shapes, line_segs, range_tags, controls, char_count

- `HwpDocument.splitParagraph()` WASM API 추가
  - 입력: section_idx, para_idx, char_offset
  - `paragraph.split_at()` 호출
  - 새 문단을 `section.paragraphs`에 삽입
  - `reflow_line_segs()` 호출 (양쪽 문단)
  - `compose_section()` + `paginate()` 재실행
  - 반환: `{"ok":true,"newParaIdx":N,"charOffset":0}`

- JS 핸들러 수정 (`web/editor.js`)
  - Enter 키: `handleTextInsert()`에서 `\n` 삽입 대신 `splitParagraph()` 호출

**테스트**:
- 문단 중간 분리
- 문단 시작/끝 분리
- char_shapes 정확한 분배
- 분리 후 재렌더링 검증

---

#### 3단계: 문단 병합 (Backspace@시작 → mergeParagraph)

**목표**: 현재 문단을 이전 문단에 병합하는 API

**파일**: `src/model/paragraph.rs`, `src/wasm_api.rs`

- `Paragraph.merge_from()` 메서드 추가
  - 입력: `&other` (병합 대상 문단)
  - 현재 문단 끝에 other의 텍스트/메타데이터를 결합
  - 결합되는 메타데이터: text, char_offsets, char_shapes, line_segs, range_tags, controls, char_count

- `HwpDocument.mergeParagraph()` WASM API 추가
  - 입력: section_idx, para_idx (현재 문단, 이전 문단과 병합)
  - `paragraphs[para_idx-1].merge_from(paragraphs[para_idx])` 호출
  - `paragraphs`에서 para_idx 제거
  - `reflow_line_segs()` 호출 (병합된 문단)
  - `compose_section()` + `paginate()` 재실행
  - 반환: `{"ok":true,"paraIdx":N,"charOffset":M}` (M = 이전 문단의 원래 텍스트 끝 위치)

- JS 핸들러 수정 (`web/editor.js`)
  - Backspace(charOffset===0): `handleTextDelete()`에서 `mergeParagraph()` 호출

**테스트**:
- 두 문단 병합 후 텍스트 연결
- char_shapes/line_segs 올바른 시프트
- 병합 후 캐럿 위치 정확성

---

#### 4단계: 통합 테스트 및 빌드 검증

**목표**: 전체 파이프라인 검증

- `docker compose run --rm test` — 기존 245개 + 새 테스트 통과
- `docker compose run --rm wasm` — WASM 빌드 성공
- 브라우저 검증:
  - 텍스트 입력 시 줄 바꿈 자동 적용
  - Enter로 문단 분리
  - Backspace(시작)로 문단 병합
  - 연속 편집 후 레이아웃 정확성

### 5. 영향 범위

| 파일 | 변경 사항 |
|------|-----------|
| `src/renderer/composer.rs` | `reflow_line_segs()` 함수 추가 |
| `src/model/paragraph.rs` | `split_at()`, `merge_from()` 메서드 추가 |
| `src/wasm_api.rs` | `splitParagraph`, `mergeParagraph` API 추가, insert/delete에 리플로우 통합 |
| `web/editor.js` | Enter → splitParagraph, Backspace@시작 → mergeParagraph |

### 6. 리스크 및 고려사항

- **텍스트 너비 추정 정확도**: `estimate_text_width()`가 휴리스틱 기반이므로, 실제 브라우저 폰트 렌더링과 차이가 있을 수 있음. 그러나 현재 시스템은 이미 이 함수를 사용하고 있으므로 일관성 유지.
- **컨트롤 문자**: 표/도형 등 인라인 컨트롤이 포함된 문단의 분리/병합은 이번 범위에서 제외 (텍스트만 있는 문단 대상)
- **크로스 문단 선택 삭제**: 여러 문단에 걸친 선택 삭제는 이번 범위에서 제외
