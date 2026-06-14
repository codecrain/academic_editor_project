# 타스크 193 — 2~4단계 완료 보고서

## 완료 내용: 프론트엔드 편집 모드 + 도구상자 전환 + 텍스트 편집 파이프라인

2~4단계는 상호 의존성이 높아 통합 구현하였다.

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `rhwp-studio/src/engine/cursor.ts` | 머리말/꼬리말 편집 모드 상태 필드 및 메서드 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 9개 WASM 브리지 메서드 추가 |
| `rhwp-studio/src/engine/input-handler-text.ts` | 텍스트 삽입/삭제/IME 3-way 분기 (본문/셀/머리말꼬리말) |
| `rhwp-studio/src/engine/input-handler-keyboard.ts` | Esc/방향키/Enter/Backspace/Delete 키보드 핸들링 |
| `rhwp-studio/src/engine/input-handler-mouse.ts` | 더블클릭 진입 및 본문 클릭 탈출 로직 |
| `rhwp-studio/src/command/commands/page.ts` | header-create, footer-create, headerfooter-close 커맨드 |
| `rhwp-studio/index.html` | data-cmd 속성 추가, .tb-headerfooter-group, 메뉴 활성화 |
| `rhwp-studio/src/main.ts` | headerFooterModeChanged 이벤트 → 도구상자 전환/dimming |
| `rhwp-studio/src/styles/editor.css` | .hf-editing 본문 dimming CSS |
| `rhwp-studio/src/styles/toolbar.css` | .tb-hf-label 스타일 |
| `pkg/rhwp.d.ts` | 9개 머리말/꼬리말 WASM 메서드 타입 선언 |

### 2단계: 커서 상태 관리 및 편집 모드 진입/탈출

**cursor.ts 추가 필드:**
- `_headerFooterMode`: 'none' | 'header' | 'footer'
- `_hfSectionIdx`, `_hfApplyTo`, `_hfParaIdx`, `_hfCharOffset`
- `_savedBodyPosition`: 본문 위치 저장 (편집 탈출 시 복원)

**cursor.ts 추가 메서드:**
- `isInHeaderFooter()` — 편집 모드 여부
- `enterHeaderFooterMode(isHeader, sectionIdx, applyTo)` — 진입
- `exitHeaderFooterMode()` — 탈출 (본문 캐럿 복원)
- `setHfCursorPosition(paraIdx, charOffset)` — 커서 이동
- `moveHorizontalInHf(delta)` — 좌우 이동 (문단 경계 처리)
- `updateRect()` 수정 — 편집 모드에서 `getCursorRectInHeaderFooter` 사용

**편집 모드 진입 경로:**
1. 메뉴 커맨드 (page:header-create, page:footer-create)
2. 도구상자 버튼 (data-cmd 연동)
3. 더블클릭 (hitTestHeaderFooter로 영역 판별)

**편집 모드 탈출 경로:**
1. Esc 키
2. 본문 영역 클릭 (hitTestHeaderFooter false)
3. 닫기 버튼 (page:headerfooter-close)

### 3단계: 문맥 도구상자 및 시각적 표시

**도구상자 전환 (`main.ts` — headerFooterModeChanged 이벤트):**
- 진입 시: `.tb-headerfooter-group` 표시, 기본 도구그룹/구분선 숨김, 서식 도구 모음 숨김
- 탈출 시: 원래 상태 복원
- `.tb-hf-label`에 '머리말' 또는 '꼬리말' 텍스트 표시

**본문 dimming:**
- `#scroll-container.hf-editing` → 배경색 어둡게 변경

### 4단계: 텍스트 편집 파이프라인

**input-handler-text.ts 분기 구조:**
```
insertTextAtRaw → isInHeaderFooter() ? → wasm.insertTextInHeaderFooter
                  isInCell()         ? → wasm.insertTextInCell
                  else               → Command system
```

**키보드 핸들링 (input-handler-keyboard.ts):**
- Enter → `splitParagraphInHeaderFooter`
- Backspace → 문자 삭제 또는 문단 병합
- Delete → 문자 삭제 또는 다음 문단 병합
- ArrowLeft/Right → `moveHorizontalInHf`
- Esc → 편집 모드 탈출

**IME 한글 입력 (input-handler-text.ts):**
- `onCompositionStart`: hfCharOffset 기준 앵커 설정
- `onInput` 조합 중: `setHfCursorPosition` 사용
- `onInput` 일반: 직접 WASM 호출 (Command 시스템 우회)

### 검증 결과
- **Rust 테스트**: 664개 전체 통과
- **TypeScript**: 컴파일 오류 없음 (`npx tsc --noEmit` 통과)
- **WASM 빌드**: 타입 선언(rhwp.d.ts)에 메서드 추가 완료, Docker 빌드 시 자동 생성됨
