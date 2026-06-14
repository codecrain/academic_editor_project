# 타스크 73 — 1단계 완료 보고서

## 작업 내용: 렌더러 기호 수정 + 강제 줄 바꿈 지원 (백엔드)

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/composer.rs` | `ComposedLine.has_line_break` 필드 추가, `compose_lines()`에서 `\n` 감지 및 제거 |
| `src/renderer/render_tree.rs` | `TextRunNode.is_line_break_end` 필드 추가 |
| `src/renderer/layout.rs` | 10개 TextRunNode 생성 위치에 `is_line_break_end` 전달 (주요 3개는 `comp_line.has_line_break` 연동, 나머지 `false`) |
| `src/renderer/svg.rs` | ¶(U+00B6) → ↵(U+21B5) 변경, `is_line_break_end` 조건 추가 |
| `src/renderer/web_canvas.rs` | ¶(U+00B6) → ↵(U+21B5) 변경, `is_line_break_end` 조건 추가 |
| `src/renderer/html.rs` | ¶(U+00B6) → ↵(U+21B5) 변경, `is_line_break_end` 조건 추가 |

### 검증

- `docker compose --env-file /dev/null run --rm test` — **488개 테스트 통과**
