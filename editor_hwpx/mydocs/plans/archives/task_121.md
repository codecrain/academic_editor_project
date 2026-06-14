# 타스크 121 수행계획서

## 과제명
문단모양 설정 다이얼로그 UI 구현

## 배경

현재 웹 편집기는 포맷 툴바에서 정렬(양쪽/왼쪽/오른쪽/가운데) 변경만 지원한다. HWP 프로그램의 "문단 모양" 대화상자(Alt+T)에 해당하는 종합 속성 설정 UI가 없어, 여백·들여쓰기·줄간격·탭 설정·테두리/배경 등 세밀한 문단 속성을 조정할 수 없다.

## 현재 상태

- **ParaShape 모델** (`src/model/style.rs:128-167`): 모든 속성 필드 존재 (alignment, margin, indent, spacing, line_spacing, tab_def_id, border_fill_id, border_spacing 등)
- **ParaShapeMods** (`src/model/style.rs:579-604`): 8개 속성만 지원 (alignment, line_spacing, line_spacing_type, indent, margin_left/right, spacing_before/after)
- **WASM API** (`src/wasm_api.rs`): `getParaPropertiesAt`은 9개 필드만 반환, `parse_para_shape_mods`도 8개만 파싱
- **웹 UI** (`rhwp-studio/`): 문단모양 대화상자 컴포넌트 없음, 포맷 툴바의 정렬 버튼만 존재

## 구현 계획 (6단계)

### 1단계: 기본 탭 — 대화상자 프레임 + 기본 속성 UI

**목표**: 대화상자 컴포넌트 프레임(4탭 구조)과 기본 탭(정렬/여백/첫줄/간격/미리보기) 구현

#### 1-1. ParaShapeDialog 클래스 생성

**파일**: `rhwp-studio/src/ui/para-shape-dialog.ts` (신규)

- 오버레이 + 대화상자 DOM 구성
- 4탭 시스템: 기본 / 확장 / 탭 설정 / 테두리/배경
- 설정(D) / 취소 버튼
- Alt+T 단축키 연동 (`rhwp-studio/src/ui/format-toolbar.ts`)

#### 1-2. 기본 탭 UI

- 정렬 방식: 6버튼 (양쪽/왼쪽/오른쪽/가운데/배분/나눔)
- 여백: 왼쪽, 오른쪽 (pt)
- 첫 줄: 보통/들여쓰기/내어쓰기 라디오 + 값 입력
- 간격: 줄 간격 종류(글자에따라/고정값/여백만/최소) + 값, 문단 위/아래
- 미리보기 영역

**검증**: Docker 테스트 571+ 통과, WASM 빌드, Vite 빌드

---

### 2단계: 확장 탭 — 문단 종류/기타 옵션/세로 정렬

**목표**: 확장 탭의 3개 섹션 구현

#### 2-1. ParaShapeMods 확장

**파일**: `src/model/style.rs`

기존 8개 + 11개 필드 추가:
- `head_type`, `para_level` (문단 종류)
- `widow_orphan`, `keep_with_next`, `keep_lines`, `page_break_before` (나눔)
- `font_line_height`, `single_line` (기타)
- `auto_space_kr_en`, `auto_space_kr_num` (자동 공백)
- `vertical_align` (세로 정렬)

`apply_to()` 확장: attr1/attr2 비트 동기화

#### 2-2. WASM API 확장

**파일**: `src/wasm_api.rs`

`build_para_properties_json()`: 기존 9개 → 20개 필드 출력
`parse_para_shape_mods()`: 새 11개 키 파싱 추가

#### 2-3. 확장 탭 UI

**파일**: `rhwp-studio/src/ui/para-shape-dialog.ts`

- 문단 종류: headType 라디오(없음/개요/번호/글머리표), paraLevel 드롭다운
- 기타: 6개 체크박스 (외톨이줄/단락보호/쪽나눔앞/글꼴줄높이/한줄/자동공백)
- 세로 정렬: 드롭다운 (글꼴기준/위/가운데/아래)

**검증**: Docker 테스트 571+ 통과, WASM 빌드, Vite 빌드

---

### 3단계: 탭 설정 탭 — TabDef 생성/재사용

**목표**: 탭 설정 탭의 전체 기능 구현

#### 3-1. TabDef PartialEq + find_or_create_tab_def()

**파일**: `src/model/style.rs` — TabItem/TabDef에 PartialEq/Eq 구현
**파일**: `src/model/document.rs` — `find_or_create_tab_def()` 추가

#### 3-2. WASM API 확장

**파일**: `src/wasm_api.rs`

- `build_para_properties_json()`: +4필드 (tabAutoLeft, tabAutoRight, tabStops, defaultTabSpacing)
- 시그니처 변경: `sec_idx` 매개변수 추가 (기본 탭 간격 조회용)
- `apply_para_format_native()`: TabDef 생성 로직 추가
- 헬퍼: `json_has_tab_keys()`, `build_tab_def_from_json()`, `parse_tab_stops_json()`

#### 3-3. ParaShapeMods에 tab_def_id 추가

**파일**: `src/model/style.rs` — `pub tab_def_id: Option<u16>` 추가

#### 3-4. 탭 설정 탭 UI

**파일**: `rhwp-studio/src/ui/para-shape-dialog.ts`

- 탭 종류: 4개 라디오 (왼쪽/오른쪽/가운데/소수점)
- 채움 모양: 드롭다운 (8종류, HWP 스펙 표 27)
- 탭 위치: 숫자 입력 + 추가 버튼
- 탭 목록: 2열 테이블(위치/종류) + 삭제/전체삭제 버튼
- 지운 탭 목록: 삭제된 탭 표시 + 더블클릭 복원
- 자동 탭: 2개 체크박스
- 기본 탭 간격: 구역 기본값 표시 (읽기 전용)

**검증**: Docker 테스트 571+ 통과, WASM 빌드, Vite 빌드

---

### 4단계: 테두리/배경 탭 — BorderFill 재사용

**목표**: 테두리/배경 탭의 전체 기능 구현

#### 4-1. ParaShapeMods에 border_fill_id + border_spacing 추가

**파일**: `src/model/style.rs`

```rust
pub border_fill_id: Option<u16>,
pub border_spacing: Option<[i16; 4]>,
```

#### 4-2. WASM API 확장

**파일**: `src/wasm_api.rs`

- `build_para_properties_json()`: +12필드 (borderFillId, borderLeft/Right/Top/Bottom, fillType, fillColor, patternColor, patternType, borderSpacing)
- `apply_para_format_native()`: 기존 `create_border_fill_from_json()` 재사용, `parse_json_i16_array()` 헬퍼 추가

#### 4-3. 테두리/배경 탭 UI

**파일**: `rhwp-studio/src/ui/para-shape-dialog.ts`

- 테두리: 종류(18개)/굵기(16개)/색 + 미리보기 + 프리셋(없음/상자/격자/사용자/모두)
- 배경: 면색(색없음/색지정+피커), 무늬색, 무늬모양(7종)
- 간격: 2열×3행 그리드 (왼쪽/위쪽/오른쪽/아래쪽/모두/문단여백무시)

**검증**: Docker 테스트 571+ 통과, WASM 빌드, Vite 빌드

---

### 5단계: 구역 정의 파서 버그 수정

**목표**: default_tab_spacing 값 오류 수정

#### 5-1. 파서 수정

**파일**: `src/parser/body_text.rs` (parse_section_def)

HWP 스펙 표 131의 "가로 줄맞춤" HWPUNIT16 필드(2바이트)가 누락되어 default_tab_spacing이 2바이트 밀려 읽혔음. `_horizontal_align` 필드 추가, consumed 22→24 바이트.

#### 5-2. 직렬화기 수정

**파일**: `src/serializer/control.rs` (serialize_section_def)

동일하게 `horizontal_align` 2바이트 추가하여 라운드트립 정합성 확보.

#### 5-3. 테스트 데이터 수정

**파일**: `src/parser/body_text.rs` (test_parse_section_with_section_def)

테스트 데이터에 horizontal_align 2바이트 추가.

**검증**: Docker 테스트 571+ 통과

---

### 6단계: 최종 빌드 + 완료 처리

1. Docker 전체 테스트 실행 (571+ 테스트 통과)
2. WASM 빌드
3. TS 타입 체크 + Vite 빌드
4. 수동 테스트: Alt+T → 4개 탭 전환 → 각 속성 변경 → 설정 → 렌더링 확인
5. 오늘할일 상태 갱신

## 핵심 수정 파일

| 파일 | 변경 유형 | 변경 내용 |
|------|----------|----------|
| `src/model/style.rs` | 수정 | ParaShapeMods 22필드 확장, TabItem/TabDef PartialEq |
| `src/model/document.rs` | 수정 | find_or_create_tab_def() 추가 |
| `src/wasm_api.rs` | 수정 | getter 36+필드, apply에서 TabDef/BorderFill 생성, 헬퍼 함수 |
| `src/parser/body_text.rs` | 수정 | 구역정의 파서 horizontal_align 필드 추가 |
| `src/serializer/control.rs` | 수정 | 구역정의 직렬화 horizontal_align 필드 추가 |
| `src/serializer/doc_info.rs` | 수정 | serialize_tab_def pub 공개 |
| `rhwp-studio/src/core/types.ts` | 수정 | ParaProperties 34필드 확장 |
| `rhwp-studio/src/ui/para-shape-dialog.ts` | 신규 | 4탭 대화상자 컴포넌트 (~1500줄) |
| `rhwp-studio/src/ui/format-toolbar.ts` | 수정 | Alt+T 핸들러, ¶ 버튼 추가 |
| `rhwp-studio/src/style.css` | 수정 | 대화상자 스타일 추가 (~100줄) |

## 리스크 및 대응

| 리스크 | 대응 |
|--------|------|
| ParaShapeMods 확장이 기존 서식 적용 깨뜨림 | 새 필드 모두 `Option<T>`, 기본값 None → 기존 JSON은 변경 없음 |
| 구역 정의 파서 수정이 기존 문서 깨뜨림 | 라운드트립 테스트 + 실제 HWP 파일 검증으로 확인 |
| 테두리 CSS 미리보기와 실제 렌더링 차이 | CSS border 스타일을 HWP 선 종류에 근사 매핑 |
| TabDef/BorderFill 중복 생성 | find_or_create 패턴으로 동일 항목 재사용 |

## 참조 자료

- 한컴 도움말: `mydocs/manual/hwp/Help/extracted/format/paragraph/` (paragraph.htm, paragraph_tab.htm, paragraph(border).htm 등)
- HWP 스펙: `mydocs/tech/hwp_spec_5.0.md` (표 45 PARA_SHAPE, 표 25 BORDER_FILL, 표 38 TAB_DEF, 표 131 구역 정의)
- 글자 테두리/배경 참조: `rhwp-studio/src/ui/char-shape-dialog.ts:532-688`
- WASM BorderFill 생성: `src/wasm_api.rs:8660` (create_border_fill_from_json)
