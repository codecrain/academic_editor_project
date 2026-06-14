# 타스크 33 — 3단계 완료 보고서: WASM JSON 반영 + 서식 툴바 연동

## 수행 내용

### 3-1. getPageTextLayout() JSON — 자동 반영 확인

`getPageTextLayout()`은 `text_run.style.font_family`를 JSON에 출력하는데, 이 값은 2단계에서 수정한 `resolved_to_text_style()`이 `font_family_for_lang(lang_index)`를 사용하여 이미 언어별 올바른 폰트가 반영된다. **별도 수정 불필요.**

### 3-2. getCharPropertiesAt() 언어별 폰트 반영 (`wasm_api.rs`)

`build_char_properties_json()` 수정:
- 캐럿 위치 문자(`char_offset`)의 Unicode 값으로 `detect_lang_category()` 호출
- `cs.font_family_for_lang(lang_index)` 사용하여 해당 언어의 폰트 이름 반환
- 이전: 항상 `cs.font_family` (한국어 폰트) 반환
- 이후: 영문 위치 → 영문 폰트, 한글 위치 → 한글 폰트

### 3-3. 서식 툴바 폰트 표시 — 자동 반영

`format_toolbar.js`의 `_updateCharUI(props)`는 `props.fontFamily`를 표시하므로, WASM API가 올바른 폰트를 반환하면 자동으로 서식 툴바에 정확한 폰트 이름이 표시된다. **별도 수정 불필요.**

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/wasm_api.rs` | build_char_properties_json()에서 캐럿 위치 문자 언어별 폰트 반환 |

## 테스트 결과

- **전체**: 414 passed / 1 failed (기존 실패: `test_svg_render_with_table_after_cell_edit` — 이번 변경 무관)
- **WASM 빌드**: 성공

## 효과

1. **렌더링**: 한영 혼합 텍스트에서 영문이 영문 폰트, 한글이 한글 폰트로 렌더링
2. **서식 툴바**: 캐럿이 영문 위에 있으면 영문 폰트(예: Arial) 표시, 한글 위에 있으면 한글 폰트(예: 함초롬돋움) 표시
3. **자간/장평**: 언어별 자간(spacings)과 장평(ratios) 값이 각 언어에 맞게 적용
