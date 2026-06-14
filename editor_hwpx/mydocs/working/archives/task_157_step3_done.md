# 타스크 157 — 3단계 완료 보고서

## 단계 목표

글상자 생성 UI — 사용자가 메뉴에서 글상자 모드를 선택한 후 마우스 드래그로 영역을 지정하여 새 글상자를 생성한다.

## 구현 내용

### 글상자 배치 모드

기존 그림 삽입의 "배치 모드" 패턴을 재활용하여 글상자 전용 배치 모드를 구현했다.

**흐름:**
1. 메뉴 `입력 → 글상자` 클릭 → `enterTextboxPlacementMode()` 호출
2. 커서가 crosshair로 변경
3. 편집 영역에서 마우스다운 → 드래그 시작 + 점선 오버레이 표시
4. 마우스업 → `finishTextboxPlacement()` 호출
   - 드래그한 경우: 드래그 영역 크기로 글상자 생성
   - 클릭만 한 경우: 30mm × 30mm 기본 크기로 생성
5. 생성된 글상자가 자동으로 선택 상태(8방향 핸들)로 진입
6. Escape 키로 배치 모드 취소 가능

### 크기 결정 로직

- 드래그 영역: 화면 px → 줌 역산 → HWPUNIT 변환 (1px = 75 HWP at 96 DPI)
- 최소 크기: 10px (≈750 HWPUNIT ≈ 2.6mm)
- 클릭만 한 경우: 30mm × 30mm (≈8504 HWPUNIT)
- 열 폭 초과 시 비례 축소

## 변경 파일 (5개, 2단계 이후 추가분)

| 파일 | 변경 내용 |
|------|-----------|
| `rhwp-studio/index.html` | `insert:textbox` 메뉴 항목에서 `disabled` 제거 |
| `rhwp-studio/src/command/commands/insert.ts` | `insert:textbox` stub → 실제 구현 (`enterTextboxPlacementMode` 호출) |
| `rhwp-studio/src/engine/input-handler.ts` | 글상자 배치 모드 상태 변수 3개 + 메서드 6개 추가 (`enterTextboxPlacementMode`, `cancelTextboxPlacement`, `showTextboxPlacementOverlay`, `hideTextboxPlacementOverlay`, `finishTextboxPlacement`) |
| `rhwp-studio/src/engine/input-handler-mouse.ts` | `onClick`/`onMouseMove`/`onMouseUp`에 글상자 배치 모드 분기 추가 |
| `rhwp-studio/src/engine/input-handler-keyboard.ts` | Escape 키로 글상자 배치 모드 취소 처리 추가 |

## 검증

- **Rust 테스트**: 608 passed, 0 failed
- **WASM 빌드**: 성공
- **TypeScript 타입 검사**: 에러 없음 (0개)
