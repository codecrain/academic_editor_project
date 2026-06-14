# 타스크 172: 문단번호/글머리표 — 수행계획서

## 목표

문단번호(Numbering)와 글머리표(Bullet) 편집 기능을 구현한다.
현재 모델·파서·렌더링은 완성되어 있으나, 편집 UI와 WASM API가 없어 사용자가 번호/글머리표를 추가·변경할 수 없다.

## 현재 상태

| 기능 | 모델 | 파서 | 렌더링 | JSON | WASM API | UI |
|------|:---:|:---:|:-----:|:---:|:-------:|:--:|
| Numbering (7수준) | ✓ | ✓ | ✓ | headType/paraLevel만 | ✗ | headType 라디오만 |
| Bullet | ✓ | ✓ | ✓ | headType만 | ✗ | headType 라디오만 |
| 수준 증감 | ✓ | — | ✓ | — | — | 커맨드만 (버튼 없음) |
| numbering_id | ✓ | ✓ | ✓ | ✗ (JSON 미출력) | ✗ | ✗ |

## 구현 범위

1. **WASM API**: numberingId JSON 연동 + 목록 조회 + 기본 정의 생성 API
2. **도구상자 UI**: 번호/글머리표 토글 버튼 + 수준 증감 버튼
3. **글머리표 팝업**: 18종 글머리표 문자 선택 그리드
4. **번호 모양 대화상자**: 한컴 호환 번호 형식 프리셋 + 시작 번호 + 미리보기

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/document_core/commands/formatting.rs` | JSON에 numberingId 출력 |
| `src/document_core/helpers.rs` | JSON에서 numberingId 파싱 |
| `src/wasm_api.rs` | getNumberingList, getBulletList, ensureDefault* API |
| `rhwp-studio/src/core/wasm-bridge.ts` | WASM API 래퍼 |
| `rhwp-studio/src/core/types.ts` | ParaProperties에 numberingId |
| `rhwp-studio/index.html` | 도구상자 버튼 HTML |
| `rhwp-studio/src/styles/icon-toolbar.css` | 번호/글머리표/수준 아이콘 |
| `rhwp-studio/src/engine/input-handler.ts` | toggleNumbering, toggleBullet |
| `rhwp-studio/src/command/commands/format.ts` | 커맨드 활성화·등록 |
| `rhwp-studio/src/ui/toolbar.ts` | 버튼 이벤트 바인딩 |
| `rhwp-studio/src/ui/bullet-popup.ts` | 글머리표 선택 팝업 (신규) |
| `rhwp-studio/src/ui/numbering-dialog.ts` | 번호 모양 대화상자 (신규) |

## 검증 방법

```bash
cargo test                                           # 테스트 통과
docker compose --env-file .env.docker run --rm wasm   # WASM 빌드
cd rhwp-studio && npm run build                       # 프론트엔드 빌드
```
