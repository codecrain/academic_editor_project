# 타스크 90 — 3단계 완료 보고서

## 단계 목표
borderFill 보완 + 글꼴 언어 매핑 수정

## 완료 항목

### 1. 글꼴 언어 그룹 매핑 수정 (핵심)
- **문제**: 모든 글꼴이 `font_faces[0]`(한글)에만 추가됨
- **수정**: `<hh:fontface lang="...">` 부모 요소의 `lang` 속성을 추적
  - `parse_hwpx_header`에서 `current_font_group` 변수로 컨텍스트 추적
  - `Event::Start`와 `Event::Empty`를 분리하여 `fontface` Start 이벤트 처리
  - `parse_font`에 `font_group: usize` 매개변수 추가
- **매핑 테이블**:
  - HANGUL → `font_faces[0]`
  - LATIN → `font_faces[1]`
  - HANJA → `font_faces[2]`
  - JAPANESE → `font_faces[3]`
  - OTHER → `font_faces[4]`
  - SYMBOL → `font_faces[5]`
  - USER → `font_faces[6]`

### 2. borderFill 보완

**gradation 색상 파싱**:
- `<hh:color value="#RRGGBB"/>` 자식 요소 → `grad.colors` 벡터에 추가
- 기존에는 gradation 기본 속성(type, angle, center, blur)만 파싱, 색상 목록 누락

**imgBrush 파싱 추가**:
- `<hh:imgBrush>` → ImageFill 생성
  - `mode` → ImageFillMode (TILE_ALL, CENTER, FIT_TO_SIZE 등 11종 매핑)
  - `bright`, `contrast` 파싱
- `<hh:img binaryItemIDRef="...">` → ImageFill.bin_data_id

**slash(대각선) 파싱 추가**:
- `<hh:slash>` → diagonal_type, width, color

### 3. 코드 정리
- 미사용 import 제거 (`attr_eq`, `skip_element`)

## 검증 결과
- `docker compose run --rm test` — **532개 테스트 전체 통과**

## 수정 파일
| 파일 | 변경 내용 |
|------|----------|
| `src/parser/hwpx/header.rs` | fontface lang 추적, borderFill gradation/imgBrush/slash, import 정리 |
