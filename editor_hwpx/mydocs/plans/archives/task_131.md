# 타스크 131 수행계획서 — 텍스트 변형 렌더링 (외곽선/그림자/양각/음각)

## 배경

### 현재 문제

HWP 문서는 글자에 외곽선(outline), 그림자(shadow), 양각(emboss), 음각(engrave) 등의 텍스트 변형 효과를 적용할 수 있다. 현재 rhwp에서는:

1. **파서**: CharShape에서 outline_type, shadow_type 등을 파싱하지만 **비트 위치가 잘못되어 있음**
2. **모델**: emboss/engrave 전용 필드가 없음 (attr 비트에만 존재)
3. **스타일 파이프라인**: ResolvedCharStyle → TextStyle으로 텍스트 변형 속성이 전달되지 않음
4. **Canvas 렌더링**: `fillText`만 호출 — strokeText, 그림자, 3D 효과 미구현

### 비트 파싱 버그 (hwplib 참조 확인)

현재 파서 (`src/parser/doc_info.rs:536-537`):
```rust
let outline_type = ((attr >> 4) & 0x07) as u8;  // ← 잘못됨
let shadow_type = ((attr >> 7) & 0x03) as u8;   // ← 잘못됨
```

hwplib 기준 올바른 비트 위치:
| 비트 | 필드 |
|------|------|
| 0 | italic |
| 1 | bold |
| 2-3 | underline_type |
| 4-7 | underline_shape |
| **8-10** | **outline_type** (현재 4-6으로 읽음) |
| **11-12** | **shadow_type** (현재 7-8로 읽음) |
| **13** | **emboss** (미파싱) |
| **14** | **engrave** (미파싱) |
| 15 | superscript |
| 16 | subscript |
| 18-20 | strikethrough |

HWPX 파서도 동일 버그: emboss → `1 << 9` (정답: `1 << 13`), engrave → `1 << 10` (정답: `1 << 14`)

### 스타일 파이프라인 갭

```
CharShape (model/style.rs:22)
  → outline_type, shadow_type, shadow_color, shadow_offset_x/y 있음
  → emboss, engrave 필드 없음 (attr 비트에만 존재)
    ↓
ResolvedCharStyle (style_resolver.rs:19)
  → outline/shadow/emboss/engrave 필드 전혀 없음
    ↓
TextStyle (renderer/mod.rs:48)
  → outline/shadow/emboss/engrave 필드 전혀 없음
    ↓
Canvas draw_text (web_canvas.rs:564)
  → fillText만 호출, 변형 렌더링 없음
```

### 한컴 렌더링 방식 (참조)

| 효과 | 렌더링 방법 |
|------|-----------|
| 외곽선 | fillText(배경색) + strokeText(글자색), lineWidth ≈ fontSize/25 |
| 그림자 | shadow_color로 오프셋(±dx, ±dy) fillText 후 원본 fillText |
| 양각 | 3패스: ↗밝은색 → ↘어두운색 → 원본 |
| 음각 | 3패스: ↗어두운색 → ↘밝은색 → 원본 |

## 구현 단계 (4단계)

---

### 1단계: 비트 파싱 수정 + 모델 확장

**목적**: 올바른 비트 위치에서 파싱 + emboss/engrave 필드 추가

**파일 1**: `src/parser/doc_info.rs` (라인 536-537)
```rust
// [현재]
let outline_type = ((attr >> 4) & 0x07) as u8;
let shadow_type = ((attr >> 7) & 0x03) as u8;

// [변경]
let outline_type = ((attr >> 8) & 0x07) as u8;
let shadow_type = ((attr >> 11) & 0x03) as u8;
let emboss = (attr & (1 << 13)) != 0;
let engrave = (attr & (1 << 14)) != 0;
```

**파일 2**: `src/model/style.rs` — CharShape 구조체에 필드 추가
```rust
pub emboss: bool,
pub engrave: bool,
```

**파일 3**: `src/serializer/doc_info.rs` (라인 371-376) — 직렬화 비트 위치 수정
```rust
// [현재] bits 4-6, 7-8
// [변경] bits 8-10, 11-12, 13, 14
```

**파일 4**: `src/parser/hwpx/header.rs` (라인 302-303) — HWPX 파서 비트 수정
```rust
// [현재]
b"emboss" => cs.attr |= 1 << 9,
b"engrave" => cs.attr |= 1 << 10,

// [변경]
b"emboss" => { cs.attr |= 1 << 13; cs.emboss = true; }
b"engrave" => { cs.attr |= 1 << 14; cs.engrave = true; }
```

---

### 2단계: 스타일 파이프라인 확장

**목적**: CharShape → ResolvedCharStyle → TextStyle로 변형 속성 전달

**파일 1**: `src/renderer/style_resolver.rs`
- `ResolvedCharStyle` (라인 19-50)에 필드 추가:
```rust
pub outline_type: u8,     // 0=없음, 1=실선, 2=점선, 3=굵은실선, 4=파선, 5=일점쇄선, 6=이점쇄선
pub shadow_type: u8,      // 0=없음, 1=비연속, 2=연속
pub shadow_color: ColorRef,
pub shadow_offset_x: i8,
pub shadow_offset_y: i8,
pub emboss: bool,
pub engrave: bool,
```
- `resolve_single_char_style()` (라인 238-283)에서 CharShape 값 매핑

**파일 2**: `src/renderer/mod.rs`
- `TextStyle` (라인 48-73)에 필드 추가:
```rust
pub outline_type: u8,
pub shadow_type: u8,
pub shadow_color: ColorRef,
pub shadow_offset_x: f64,  // px 변환값
pub shadow_offset_y: f64,
pub emboss: bool,
pub engrave: bool,
```
- `Default` impl 업데이트

**파일 3**: `src/renderer/layout.rs`
- `resolved_to_text_style()` (라인 6872-6891)에서 ResolvedCharStyle → TextStyle 매핑 추가

---

### 3단계: Canvas 멀티패스 렌더링

**목적**: draw_text에서 텍스트 변형 효과 렌더링

**파일**: `src/renderer/web_canvas.rs` — `draw_text()` (라인 564-626)

각 효과를 클러스터 렌더링 루프 내에서 적용:

**외곽선** (outline_type > 0):
```
1. fillText(배경색 또는 흰색) — 내부 채움
2. strokeText(글자색) — 외곽선, lineWidth = fontSize / 25
```

**그림자** (shadow_type > 0):
```
1. fillText(shadow_color, x+dx, y+dy) — 그림자
2. fillText(text_color, x, y) — 원본
(dx, dy는 shadow_offset_x/y를 px로 변환)
```

**양각** (emboss):
```
1. fillText(밝은색, x-1, y-1) — 좌상단 하이라이트
2. fillText(어두운색, x+1, y+1) — 우하단 그림자
3. fillText(원본색, x, y) — 원본
```

**음각** (engrave):
```
1. fillText(어두운색, x-1, y-1) — 좌상단 그림자
2. fillText(밝은색, x+1, y+1) — 우하단 하이라이트
3. fillText(원본색, x, y) — 원본
```

**우선순위**: emboss/engrave는 상호 배타적. outline + shadow는 조합 가능.

---

### 4단계: 통합 테스트 및 검증

| 항목 | 방법 |
|------|------|
| 571개 회귀 테스트 | `docker compose run --rm test` |
| WASM 빌드 | `docker compose run --rm wasm` |
| 비트 파싱 검증 | 기존 테스트에서 outline_type/shadow_type 값이 올바르게 파싱되는지 확인 |
| 렌더링 확인 | 텍스트 변형이 적용된 샘플 HWP 문서로 시각 확인 |

---

## 변경 파일 요약

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `src/parser/doc_info.rs` | outline/shadow 비트 위치 수정, emboss/engrave 파싱 추가 | ~5줄 |
| `src/model/style.rs` | CharShape에 emboss/engrave 필드 추가 | ~5줄 |
| `src/serializer/doc_info.rs` | 직렬화 비트 위치 수정, emboss/engrave 직렬화 | ~10줄 |
| `src/parser/hwpx/header.rs` | HWPX emboss/engrave 비트 수정 | ~4줄 |
| `src/renderer/style_resolver.rs` | ResolvedCharStyle 확장 + resolve 매핑 | ~15줄 |
| `src/renderer/mod.rs` | TextStyle 확장 + Default 업데이트 | ~15줄 |
| `src/renderer/layout.rs` | resolved_to_text_style 매핑 추가 | ~10줄 |
| `src/renderer/web_canvas.rs` | draw_text 멀티패스 렌더링 | ~60줄 |
| **합계** | | **~125줄** |

## 검증 방법

1. `docker compose run --rm test` — 571개 회귀 테스트 통과 확인
2. `docker compose run --rm wasm` — WASM 빌드 성공 확인
3. 텍스트 변형이 적용된 HWP 문서를 브라우저에서 열어 외곽선/그림자/양각/음각 효과 시각 확인
