# 타스크 154 2단계 완료 보고서

> **작업일**: 2026-02-23
> **단계**: 2/3 — HWPX 이미지 좌표 수정 + Picture 속성 매핑 보강

---

## 변경 내용

### 1. `<hp:pos>` vertAlign/horzAlign 파싱 추가

**파일**: `src/parser/hwpx/section.rs`

- `<hp:pos>` 요소에서 `vertAlign`, `horzAlign` 속성을 파싱하여 `common.vert_align`, `common.horz_align`에 매핑
- 지원 값: TOP/CENTER/BOTTOM/INSIDE/OUTSIDE (vert), LEFT/CENTER/RIGHT/INSIDE/OUTSIDE (horz)

### 2. `<offset>` → `<pos>` 덮어쓰기 방지

**파일**: `src/parser/hwpx/section.rs`

- **문제**: `<hp:offset>` 요소(shape-transform 오프셋)가 `<hp:pos>`의 `vertOffset`/`horzOffset`(페이지 레벨 좌표)를 덮어쓰고 있었음
  - 예: Picture 2의 `<pos>` vertOffset=20745 → `<offset>` y=4294947388 (=-19908 signed) 으로 덮어씀
- **수정**: `has_pos` 플래그 도입
  - `<pos>` 파싱 시 `has_pos = true` 설정
  - `<offset>` 파싱 시 `has_pos`가 false인 경우에만 `common.horizontal_offset`/`common.vertical_offset` 적용
  - `shape_attr.offset_x`/`offset_y`에는 항상 저장 (그룹 내부 좌표 보존)

### 3. ShapeComponentAttr 파싱 추가

**파일**: `src/parser/hwpx/section.rs`

기존에 HWPX 파서가 전혀 설정하지 않던 `shape_attr` 필드를 HWPX XML 속성에서 매핑:

| HWPX 요소/속성 | HWP 모델 필드 | 용도 |
|----------------|---------------|------|
| `<hp:pic groupLevel="N">` | `shape_attr.group_level` | 그룹 내 깊이 |
| `<hp:orgSz width="W" height="H">` | `shape_attr.original_width/height` | 렌더러 이미지 Fill 크기 계산 (shape_layout.rs:559-560) |
| `<hp:curSz width="W" height="H">` | `shape_attr.current_width/height` | 현재 표시 크기 |
| `<hp:offset x="X" y="Y">` | `shape_attr.offset_x/offset_y` | 그룹 내부 변환 좌표 |

### 4. ShapeComponentAttr 임포트 추가

**파일**: `src/parser/hwpx/section.rs`

- `use crate::model::shape::{..., ShapeComponentAttr, ...}` 추가

---

## 검증 결과

| 항목 | 결과 |
|------|------|
| `cargo test` | **608 통과**, 0 실패 |
| `cargo clippy -- -D warnings` | **경고 0** |
| HWPX 9개 파일 SVG 내보내기 | 84 SVG, **0 에러** |
| `2024년 1분기 해외직접투자 보도자료 ff.hwpx` 이미지 | `<pos>` 좌표 유지됨 (offset 덮어쓰기 방지) |
| `통합재정통계(2011.10월).hwp` | HWP 파일 영향 없음 |

---

## 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `src/parser/hwpx/section.rs` | `ShapeComponentAttr` 임포트 추가, `has_pos` 플래그, vertAlign/horzAlign 파싱, orgSz→shape_attr, curSz→shape_attr, offset→shape_attr, groupLevel 파싱, Picture 생성 시 shape_attr 설정 |

---

## HWPX Picture 속성 매핑 현황 (2단계 완료 후)

### 파싱 완료 속성

| HWPX 속성 | HWP 모델 | 상태 |
|-----------|----------|------|
| `<pos>` vertRelTo/horzRelTo | common.vert_rel_to/horz_rel_to | ✅ |
| `<pos>` vertAlign/horzAlign | common.vert_align/horz_align | ✅ 2단계 |
| `<pos>` vertOffset/horzOffset | common.vertical_offset/horizontal_offset | ✅ |
| `<pos>` treatAsChar | common.treat_as_char | ✅ |
| `<sz>` width/height | common.width/height | ✅ |
| `<curSz>` width/height | common.width/height + shape_attr.current_width/height | ✅ 2단계 |
| `<orgSz>` width/height | shape_attr.original_width/height | ✅ 2단계 |
| `<offset>` x/y | shape_attr.offset_x/offset_y | ✅ 2단계 |
| `<hp:pic>` groupLevel | shape_attr.group_level | ✅ 2단계 |
| `<hp:pic>` zOrder | common.z_order | ✅ |
| `<hp:pic>` textWrap | common.text_wrap | ✅ |
| `<hp:pic>` instid | common.instance_id | ✅ |
| `<img>` binaryItemIDRef | img_attr.bin_data_id | ✅ |
| `<img>` bright/contrast/effect | img_attr.brightness/contrast/effect | ✅ |
| `<imgClip>` left/right/top/bottom | crop | ✅ |
| `<outMargin>` left/right/top/bottom | common.margin | ✅ |
| `<inMargin>` left/right/top/bottom | padding | ✅ |

### 미파싱 속성 (렌더러 미사용)

| HWPX 속성 | HWP 모델 | 비고 |
|-----------|----------|------|
| border 관련 | border_color, border_width 등 | 렌더러 미사용 |
| 변환 행렬 | shape_attr.render_tx 등 | HWPX에서 명시적으로 제공하지 않음 |
| 뒤집기/회전 | shape_attr.flip, rotation_angle 등 | 향후 3단계 고려 |
| 개체 설명 | common.description | 접근성 정보, 렌더링 무관 |
