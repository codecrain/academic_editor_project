# 타스크 119 수행계획서

## 과제명
글자모양 속성창 구현 및 속성 적용 기능

## 배경

현재 웹 편집기는 포맷 툴바에서 기본 서식(굵게, 기울임, 밑줄, 취소선, 글자색, 음영색, 글꼴, 크기)만 지원한다. HWP 프로그램의 "글자 모양" 대화상자(Alt+L)에 해당하는 종합 속성 설정 UI가 없어, 장평·자간·상대크기·글자위치·외곽선·그림자·첨자 등 세밀한 글자 속성을 조정할 수 없다.

## 현재 상태

- **CharShape 모델** (`src/model/style.rs`): 모든 속성 필드가 이미 존재 (shadow_offset_x/y 제외)
- **CharShapeMods** (`src/model/style.rs:472-507`): 8개 속성만 지원 (bold, italic, underline, strikethrough, font_id, base_size, text_color, shade_color)
- **WASM API** (`src/wasm_api.rs`): `getCharPropertiesAt`은 8개 필드만 반환, `parse_char_shape_mods`도 8개만 파싱
- **웹 UI** (`web/`): 모달 대화상자 컴포넌트 없음, 포맷 툴바만 존재

## 구현 계획 (4단계)

### 1단계: Rust 백엔드 확장 — CharShapeMods + WASM API

**목표**: 모든 CharShape 속성을 JS↔WASM 경계에서 읽고 쓸 수 있도록 확장

#### 1-1. CharShape 모델에 shadow offset 추가

**파일**: `src/model/style.rs` (line 48 이후)

```rust
pub shadow_offset_x: i8,  // 그림자 X 방향 (-100~100%)
pub shadow_offset_y: i8,  // 그림자 Y 방향 (-100~100%)
```

- `PartialEq` impl (line 69-93)에 새 필드 포함
- `Default`는 0 (i8 기본값)

#### 1-2. CharShapeMods 확장

**파일**: `src/model/style.rs` (line 472-507)

기존 8개 + 새로 14개 필드 추가:
- `underline_type: Option<UnderlineType>` (None/Bottom/Top — 기존 underline bool보다 우선)
- `underline_color: Option<ColorRef>`
- `outline_type: Option<u8>` (0-6)
- `shadow_type: Option<u8>` (0=없음, 1=비연속, 2=연속)
- `shadow_color: Option<ColorRef>`
- `shadow_offset_x: Option<i8>`, `shadow_offset_y: Option<i8>`
- `strike_color: Option<ColorRef>`
- `subscript: Option<bool>`, `superscript: Option<bool>` (상호 배타)
- `ratios: Option<[u8; 7]>` (장평)
- `spacings: Option<[i8; 7]>` (자간)
- `relative_sizes: Option<[u8; 7]>` (상대크기)
- `char_offsets: Option<[i8; 7]>` (글자 위치)

`apply_to()` 확장: 새 필드 모두 적용, subscript/superscript 상호 배타 처리

#### 1-3. 파서에서 shadow offset 보존

**파일**: `src/parser/doc_info.rs` (line 496-497)

`_shadow_offset_x` → `shadow_offset_x`로 변경하여 CharShape에 전달

#### 1-4. 직렬화기에서 shadow offset 출력

**파일**: `src/serializer/doc_info.rs` (line 378-380)

`0` 대신 `cs.shadow_offset_x`, `cs.shadow_offset_y` 실제 값 출력

#### 1-5. `build_char_properties_json` 확장

**파일**: `src/wasm_api.rs` (build_char_properties_json 함수)

기존 8개 필드 + 추가 반환:
```json
{
  "fontFamily": "함초롬돋움",
  "fontSize": 1000,
  "bold": true, "italic": false,
  "underline": true, "underlineType": "Bottom", "underlineColor": "#000000",
  "strikethrough": false, "strikeColor": "#000000",
  "textColor": "#000000", "shadeColor": "#ffffff",
  "shadowType": 0, "shadowColor": "#b2b2b2",
  "shadowOffsetX": 0, "shadowOffsetY": 0,
  "outlineType": 0,
  "subscript": false, "superscript": false,
  "charShapeId": 0,
  "fontFamilies": ["함초롬돋움","Arial",...],
  "ratios": [100,100,100,100,100,100,100],
  "spacings": [0,0,0,0,0,0,0],
  "relativeSizes": [100,100,100,100,100,100,100],
  "charOffsets": [0,0,0,0,0,0,0]
}
```

#### 1-6. `parse_char_shape_mods` 확장

**파일**: `src/wasm_api.rs` (parse_char_shape_mods 함수)

새 JSON 키 14개 파싱 추가: underlineType, underlineColor, outlineType, shadowType, shadowColor, shadowOffsetX, shadowOffsetY, strikeColor, subscript, superscript, ratios, spacings, relativeSizes, charOffsets

**검증**: Docker 테스트 실행 (571+ 테스트 통과)

---

### 2단계: 대화상자 UI 컴포넌트 — HTML/CSS/JS

**목표**: 글자모양 대화상자 컴포넌트를 생성하고 2개 탭(기본/확장) 구현

#### 2-1. 대화상자 CSS 추가

**파일**: `web/editor.css` (하단에 추가, ~150줄)

- `.dialog-overlay` — 반투명 배경 (z-index: 2000)
- `.dialog-wrap` — 480px 중앙 정렬, border #748bc9 (한컴 웹기안기 참조)
- `.dialog-title` — 타이틀바 (#e7eaf4), 드래그 가능
- `.dialog-tab-group`, `.dialog-tab`, `.dialog-tab.on` — 탭 시스템
- `.dialog-body`, `.dialog-section` — 콘텐츠 영역
- `.dialog-btn`, `.dialog-btn-primary` — 버튼 (설정/취소)
- `.dialog-input`, `.dialog-select`, `.dialog-color-btn` — 폼 컨트롤
- `.dialog-icon-btn`, `.dialog-icon-btn.active` — 속성 토글 버튼 (B, I 등)
- `.dialog-lang-tabs` — 언어별 속성 탭

네임스페이스: 모든 클래스 `.dialog-` 접두사로 기존 CSS와 충돌 방지

#### 2-2. 대화상자 JS 모듈 생성

**파일**: `web/char_shape_dialog.js` (신규, ~400-500줄)

```javascript
export class CharShapeDialog {
    constructor()           // DOM 생성
    open(charProps)         // 속성 표시 + 대화상자 열기
    close()                 // 대화상자 닫기
    onApply                 // 콜백: (modsJson: string) => void
}
```

**탭 1 — 기본**:
| 섹션 | 컨트롤 |
|------|--------|
| 기준 크기 | 숫자 입력 (pt) |
| 언어별 설정 | 언어 선택 탭 [대표/한글/영문/한자/일어/외국어/기호/사용자] |
| ↳ 글꼴 | 드롭다운 (대표 모드: 전체 적용) |
| ↳ 상대크기 | 숫자 입력 (10-250%) |
| ↳ 자간 | 숫자 입력 (-50~50%) |
| ↳ 장평 | 숫자 입력 (50-200%) |
| ↳ 글자 위치 | 숫자 입력 (-100~100%) |
| 속성 | 아이콘 토글: B, I, U, S, 외곽선, 위첨자, 아래첨자 |
| 글자 색 | color input |
| 음영 색 | color input |

**탭 2 — 확장**:
| 섹션 | 컨트롤 |
|------|--------|
| 그림자 | 종류(select), 색(color), X/Y(숫자) |
| 밑줄 | 위치(select: 없음/아래/위), 색(color) |
| 취소선 | 여부(checkbox), 색(color) |
| 외곽선 | 종류(select: 0-6) |

- 모든 DOM을 JS에서 동적 생성 (editor.html에 빈 컨테이너 불필요)
- Escape 키로 닫기, 드래그로 이동 가능

**검증**: 브라우저 콘솔에서 수동 테스트

---

### 3단계: 편집기 통합 — 키보드, 선택, 적용

**목표**: 대화상자를 편집기에 연결하여 실제 서식 적용

#### 3-1. Alt+L 키보드 단축키

**파일**: `web/editor.js` (keydown 핸들러, ~line 179)

```javascript
if (e.altKey && (e.key === 'l' || e.key === 'L' || e.key === 'ㄹ')) {
    e.preventDefault();
    openCharShapeDialog();
    return;
}
```

한글 IME에서 Alt+L = 'ㄹ'이므로 두 경우 모두 처리

#### 3-2. openCharShapeDialog() 함수

**파일**: `web/editor.js`

1. 현재 캐럿/선택 위치에서 `getCharPropertiesAt()` 호출 (확장된 JSON)
2. `CharShapeDialog` 인스턴스 생성 (또는 재사용)
3. `charShapeDialog.open(charProps)` 호출
4. `onApply` 콜백 → 기존 `handleApplyCharFormat(modsJson)` 연결

#### 3-3. 포맷 툴바에 "글자 모양" 버튼 추가

**파일**: `web/editor.html` (fmt-group 섹션 마지막)

```html
<div class="fmt-group">
    <button id="fmt-charshape" class="fmt-btn" title="글자 모양 (Alt+L)">Aa</button>
</div>
```

**파일**: `web/format_toolbar.js` — 버튼 클릭 → `onOpenCharShapeDialog` 콜백
**파일**: `web/editor.js` — `formatToolbar.onOpenCharShapeDialog = openCharShapeDialog`

**검증**: HWP 파일 로드 → 텍스트 선택 → Alt+L 또는 Aa 버튼 → 속성 변경 → 설정 → 렌더링 확인

---

### 4단계: 테스트 + WASM 빌드 + 완료 처리

1. Docker 전체 테스트 실행 (571+ 테스트 통과)
2. WASM 빌드
3. 웹 뷰어에서 시각적 검증:
   - 다양한 HWP 파일 로드 → 대화상자 열기 → 속성 정확히 표시되는지 확인
   - 글꼴 크기/장평/자간 변경 → 설정 → 렌더링 반영 확인
   - 확장 탭: 밑줄 종류, 취소선 색, 그림자 설정 → 적용 확인
4. 오늘할일 상태 갱신

## 핵심 수정 파일

| 파일 | 변경 유형 | 변경 내용 |
|------|----------|----------|
| `src/model/style.rs` | 수정 | CharShape에 shadow_offset 추가, CharShapeMods 14개 필드 확장 |
| `src/parser/doc_info.rs` | 수정 | shadow_offset 보존 |
| `src/serializer/doc_info.rs` | 수정 | shadow_offset 직렬화 |
| `src/wasm_api.rs` | 수정 | build_char_properties_json + parse_char_shape_mods 확장 |
| `web/char_shape_dialog.js` | 신규 | 대화상자 컴포넌트 (~400-500줄) |
| `web/editor.css` | 수정 | 대화상자 스타일 추가 (~150줄) |
| `web/editor.html` | 수정 | 포맷 툴바에 Aa 버튼 추가 |
| `web/editor.js` | 수정 | Alt+L 핸들러, openCharShapeDialog(), import |
| `web/format_toolbar.js` | 수정 | Aa 버튼 이벤트 + 콜백 |

## 리스크 및 대응

| 리스크 | 대응 |
|--------|------|
| CharShapeMods 확장이 기존 서식 적용 깨뜨림 | 새 필드 모두 `Option<T>`, 기본값 None → 기존 JSON은 변경 없음 |
| 확장된 JSON이 기존 소비자 깨뜨림 | 새 필드 추가만, 기존 필드 변경 없음 |
| 대화상자 CSS가 기존 UI와 충돌 | `.dialog-` 접두사 네임스페이스로 격리 |
| 언어별 글꼴 개별 변경 복잡도 | 1차에서는 "대표" 모드(전체 적용)만 구현, 개별 변경은 후속 과제 |

## 참조 자료

- 한컴 도움말: `mydocs/manual/hwp/Help/extracted/format/font/` (fonts.htm 등 15개 파일)
- 한컴 웹기안기 UI: `webgian/hancomgian_files/` (hcwo.css의 dialog_wrap 패턴)
- HWP 스펙: `mydocs/tech/hwp_spec_5.0.md` (HWPTAG_CHAR_SHAPE, 72바이트)
