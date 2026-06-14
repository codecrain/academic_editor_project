# 타스크 170: 글자모양 심화 속성 — 수행계획서

## 목표

글자모양 대화상자(Alt+L) 확장 탭의 강조점, 밑줄 모양, 취소선 모양, 커닝 속성을 HWP 백엔드와 연결하여 파싱·편집·렌더링이 가능하도록 한다.

## 현재 상태

| 기능 | 모델 | 파서 | JSON | UI | SVG 렌더 | 상태 |
|------|:----:|:----:|:----:|:--:|:-------:|------|
| 강조점 6종 | ✗ | ✗ | ✗ | ✓ (미연결) | ✗ | 미구현 |
| 밑줄 위치(Bottom/Top) | ✓ | ✓ | ✓ | ✓ | ✓ | 완료 |
| 밑줄 모양(11종) | ✗ | ✗ | ✗ | ✓ (미연결) | ✗ | 미구현 |
| 취소선 (on/off) | ✓ | ✓ | ✓ | ✓ | ✓ | 완료 |
| 취소선 모양(11종) | ✗ | ✗ | ✗ | ✓ (미연결) | ✗ | 미구현 |
| 커닝 | ✗ | ✗ | ✗ | ✓ (미연결) | ✗ | 미구현 |

## HWP 스펙 참조 (CharShape attr 비트)

- bits 4-7: 밑줄 모양 (표 27 선 종류)
- bits 21-24: 강조점 종류 (0=없음, 1=● 2=○ 3=ˇ 4=˜ 5=･ 6=˸)
- bits 26-29: 취소선 모양 (표 27 선 종류)
- bit 30: 커닝

## 구현 범위

1. **Rust 모델**: CharShape/CharShapeMods에 4개 필드 추가
2. **파서/시리얼라이저**: attr 비트 추출/기록
3. **JSON 연동**: build_char_properties_json, parse_char_shape_mods
4. **프론트엔드**: CharProperties 타입 + 대화상자 확장 탭 백엔드 연결
5. **렌더링**: SVG/Canvas 강조점 + 밑줄/취소선 선 모양(dasharray, 이중선, 삼중선)

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/model/style.rs` | CharShape + CharShapeMods에 4개 필드 |
| `src/parser/doc_info.rs` | parse_char_shape 비트 추출 |
| `src/serializer/doc_info.rs` | serialize_char_shape 비트 기록 |
| `src/document_core/commands/formatting.rs` | JSON 출력 4개 필드 추가 |
| `src/document_core/helpers.rs` | JSON 파싱 4개 필드 |
| `src/renderer/style_resolver.rs` | ResolvedCharStyle 4개 필드 |
| `src/renderer/mod.rs` | TextStyle 5개 필드 |
| `src/renderer/layout/text_measurement.rs` | resolved_to_text_style 매핑 |
| `src/renderer/svg.rs` | 강조점 렌더링 + draw_line_shape (11종) |
| `src/renderer/web_canvas.rs` | 강조점 렌더링 + draw_line_shape_canvas |
| `src/renderer/html.rs` | CSS text-decoration-style 확장 |
| `rhwp-studio/src/core/types.ts` | CharProperties 4개 필드 |
| `rhwp-studio/src/ui/char-shape-dialog.ts` | 확장 탭 백엔드 연결 |

## 검증 방법

```bash
cargo test                                           # 615개 통과
docker compose --env-file .env.docker run --rm wasm   # WASM 빌드
cd rhwp-studio && npm run build                       # 프론트엔드 빌드
```
