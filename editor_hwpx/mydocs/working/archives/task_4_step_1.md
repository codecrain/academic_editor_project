# 타스크 4 - 1단계 완료 보고서: 스타일 목록 구성 (Style Resolution)

## 구현 내용

### 신규 파일

| 파일 | 라인 | 역할 |
|------|------|------|
| `src/renderer/style_resolver.rs` | 297 | 스타일 해소 모듈 |

### 구현 구조체

| 구조체 | 설명 |
|--------|------|
| `ResolvedCharStyle` | 해소된 글자 스타일 (폰트명, 크기, 볼드, 이탤릭, 색상, 밑줄, 자간, 장평) |
| `ResolvedParaStyle` | 해소된 문단 스타일 (정렬, 줄간격, 여백, 들여쓰기) |
| `ResolvedBorderStyle` | 해소된 테두리/배경 스타일 (테두리선, 배경색) |
| `ResolvedStyleSet` | 위 세 가지를 통합한 스타일 세트 |

### 구현 함수

| 함수 | 설명 |
|------|------|
| `resolve_styles(doc_info, dpi)` | DocInfo → ResolvedStyleSet 변환 (메인 함수) |
| `resolve_single_char_style()` | CharShape + FontFace → ResolvedCharStyle |
| `resolve_single_para_style()` | ParaShape → ResolvedParaStyle |
| `resolve_single_border_style()` | BorderFill → ResolvedBorderStyle |
| `lookup_font_name()` | FontFace 테이블에서 폰트명 조회 |

### 스타일 해소 흐름

```
DocInfo.char_shapes[id]
  ├── font_ids[0] → DocInfo.font_faces[0][font_id].name → font_family
  ├── base_size → HWPUNIT → px → font_size
  ├── bold, italic → 그대로
  ├── text_color → 그대로
  ├── spacings[0] → font_size 기준 % → letter_spacing (px)
  └── ratios[0] → / 100 → ratio

DocInfo.para_shapes[id]
  ├── alignment → 그대로
  ├── line_spacing + type → px 또는 %
  ├── margin_left/right → HWPUNIT → px
  ├── indent → HWPUNIT → px
  └── spacing_before/after → HWPUNIT → px

DocInfo.border_fills[id]
  ├── borders[4] → 그대로
  └── fill.solid.background_color → fill_color
```

## 테스트 결과

| 항목 | 결과 |
|------|------|
| 전체 테스트 | **191개 통과** (177 기존 + 14 신규) |
| 빌드 | 성공 (경고 0개) |

### 신규 테스트 (14개)

| 테스트 | 검증 내용 |
|--------|----------|
| test_resolve_char_style_font_name | 폰트명 조회 (함초롬돋움, 함초롬바탕) |
| test_resolve_char_style_size | 크기 변환 (2400 HWPUNIT → 32px, 1000 → 13.3px) |
| test_resolve_char_style_bold_italic | 볼드/이탤릭 플래그 |
| test_resolve_char_style_color | 글자 색상 |
| test_resolve_char_style_underline | 밑줄 종류 |
| test_resolve_char_style_ratio | 장평 비율 (100% → 1.0, 80% → 0.8) |
| test_resolve_char_style_letter_spacing | 자간 (% → px 변환) |
| test_resolve_para_style_alignment | 정렬 방식 (Center, Justify) |
| test_resolve_para_style_line_spacing | 줄간격 (%, 고정) |
| test_resolve_para_style_margins | 여백/들여쓰기 (HWPUNIT → px) |
| test_resolve_border_style | 테두리선 + 배경색 |
| test_resolve_empty_doc_info | 빈 DocInfo 처리 |
| test_lookup_font_missing | 없는 폰트 ID 처리 |
| test_resolve_border_no_fill | 채우기 없는 테두리 |

## 상태

- 완료일: 2026-02-05
- 상태: 승인 완료
