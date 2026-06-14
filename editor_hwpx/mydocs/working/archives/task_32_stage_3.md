# 타스크 32 - 3단계 완료 보고서

## 단계: WASM 서식 적용 API

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/wasm_api.rs` | 4개 WASM API + 4개 네이티브 메서드 + JSON 파싱 헬퍼 + rebuild_section + css_color_to_bgr |

## 추가된 WASM API

| API | 설명 |
|-----|------|
| `applyCharFormat(sec, para, start, end, propsJson)` | 본문 문단 글자 서식 적용 |
| `applyCharFormatInCell(sec, parentPara, ctrl, cell, cellPara, start, end, propsJson)` | 셀 내 글자 서식 적용 |
| `applyParaFormat(sec, para, propsJson)` | 본문 문단 서식 적용 |
| `applyParaFormatInCell(sec, parentPara, ctrl, cell, cellPara, propsJson)` | 셀 내 문단 서식 적용 |

## 구현 상세

### props_json 형식 (글자 서식)
```json
{"bold":true}
{"italic":true,"underline":false}
{"fontSize":2400,"textColor":"#ff0000"}
{"fontId":5}
```

### props_json 형식 (문단 서식)
```json
{"alignment":"center"}
{"lineSpacing":200,"lineSpacingType":"Percent"}
{"indent":1000}
```

### 처리 흐름
1. `props_json` 파싱 → `CharShapeMods` / `ParaShapeMods`
2. 대상 문단의 기존 스타일 ID 조회
3. `find_or_create_char_shape(base_id, mods)` → 새 ID (중복 제거)
4. `apply_char_shape_range(start, end, new_id)` (글자 서식) 또는 `para_shape_id = new_id` (문단 서식)
5. `rebuild_section()` → 스타일 재해석 + 재조판 + 재페이지네이션
6. `{"ok":true}` 반환

### 유틸리티 함수
- `parse_char_shape_mods(json)` — JSON → CharShapeMods
- `parse_para_shape_mods(json)` — JSON → ParaShapeMods
- `json_bool/json_i32/json_u16/json_str/json_color` — 간단한 JSON 값 파서
- `css_color_to_bgr(css)` — CSS hex (#rrggbb) → HWP BGR (0x00BBGGRR)
- `rebuild_section(idx)` — resolve_styles + compose_section + paginate

## 테스트 결과
- **399개 테스트 모두 통과**
