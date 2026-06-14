# 타스크 171: 문단모양 심화 — 수행계획서

## 목표

문단모양의 고급 기능을 보완한다:
1. 서식 도구 모음에 배분/나눔 정렬 버튼 추가
2. 줄바꿈 모드(한글 어절/글자, 영어 단어/하이픈/글자) 편집 파이프라인 완성

## 현재 상태

| 기능 | 모델 | 파서 | JSON | 서식바 | 대화상자 | 렌더링 | 상태 |
|------|:---:|:---:|:---:|:-----:|:------:|:-----:|------|
| 배분/나눔 정렬 | ✓ | ✓ | ✓ | ✗ (4개만) | ✓ (6개) | ✓ | 서식바 미완 |
| 줄바꿈 모드 | attr1 raw | attr1 raw | ✗ | — | ✗ | ✓ | JSON·UI 미완 |
| 줄간격 드롭다운 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 완료 |

## 구현 범위

1. **서식바**: 배분/나눔 버튼 HTML + CSS + 이벤트 + 커맨드
2. **Rust 모델**: ParaShapeMods에 english_break_unit, korean_break_unit 필드
3. **JSON 연동**: build_para_properties_json 출력 + parse_para_shape_mods 파싱
4. **프론트엔드**: ParaProperties 타입 + 대화상자 확장 탭 줄바꿈 UI

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|-----------|
| `rhwp-studio/index.html` | 배분/나눔 버튼 HTML |
| `rhwp-studio/src/styles/style-bar.css` | 배분/나눔 아이콘 CSS |
| `rhwp-studio/src/ui/toolbar.ts` | 배분/나눔 버튼 이벤트 |
| `rhwp-studio/src/command/commands/format.ts` | 배분/나눔 커맨드 |
| `src/model/style.rs` | ParaShapeMods에 break_unit 필드 |
| `src/document_core/commands/formatting.rs` | JSON에 break_unit 출력 |
| `src/document_core/helpers.rs` | JSON에서 break_unit 파싱 |
| `rhwp-studio/src/core/types.ts` | ParaProperties에 break_unit |
| `rhwp-studio/src/ui/para-shape-dialog.ts` | 확장 탭 줄바꿈 UI |

## 검증 방법

```bash
cargo test                                           # 615개 통과
docker compose --env-file .env.docker run --rm wasm   # WASM 빌드
cd rhwp-studio && npm run build                       # 프론트엔드 빌드
```
