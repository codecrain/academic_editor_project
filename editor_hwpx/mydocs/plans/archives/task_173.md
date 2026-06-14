# 타스크 173: 스타일 편집 — 수행계획서

## 목표

스타일(Style) 편집 기능을 구현한다.
현재 스타일 적용(applyStyle)은 구현되어 있으나, 스타일 생성·편집·삭제를 위한 WASM API와 UI가 없다.
한컴 F6 대화상자를 참고하여 스타일 목록 + 속성 미리보기 + 편집 기능을 제공한다.

## 현재 상태

| 기능 | WASM API | UI |
|------|:-------:|:--:|
| 스타일 목록 조회 | ✓ getStyleList | ✓ 드롭다운 |
| 스타일 적용 | ✓ applyStyle | ✓ 드롭다운 change |
| 스타일 속성 조회 (by ID) | ✗ | ✗ |
| 스타일 편집 | ✗ | ✗ |
| 스타일 생성 | ✗ | ✗ |
| 스타일 삭제 | ✗ | ✗ |

## 구현 범위

1. **WASM API 확장**: getStyleDetail + updateStyle + createStyle + deleteStyle + updateStyleShapes
2. **스타일 대화상자**: 스타일 목록 + 속성 미리보기 + 적용 (한컴 F6)
3. **스타일 편집 서브 대화상자**: 이름/영문이름/다음스타일/문단모양/글자모양 편집
4. **메뉴 연동**: 서식 메뉴 + F6 단축키 + 커맨드 등록

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/wasm_api.rs` | getStyleList 확장 + 신규 API 5개 |
| `src/document_core/commands/formatting.rs` | build_char_properties_json_by_id 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | WASM API 래퍼 5개 |
| `rhwp-studio/src/ui/style-dialog.ts` | 스타일 메인 대화상자 (신규) |
| `rhwp-studio/src/ui/style-edit-dialog.ts` | 스타일 편집/추가 서브 대화상자 (신규) |
| `rhwp-studio/src/styles/style-dialog.css` | 대화상자 CSS (신규) |
| `rhwp-studio/index.html` | 메뉴 항목 추가 |
| `rhwp-studio/src/command/commands/format.ts` | 커맨드 등록 |

## 검증 방법

```bash
cargo test
docker compose --env-file .env.docker run --rm wasm
cd rhwp-studio && npm run build
```
