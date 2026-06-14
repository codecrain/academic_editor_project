# 타스크 87 — 4단계 완료보고서

## 빌드 검증 + 리사이즈 커서

### 완료 내용

#### 1. 리사이즈 커서 (`input-handler.ts`)
- `onMouseMove` 이벤트 핸들러 추가: 표 객체 선택 중 핸들 위 마우스 이동 시 커서 변경
- 핸들별 커서: NW/SE → `nwse-resize`, NE/SW → `nesw-resize`, N/S → `ns-resize`, E/W → `ew-resize`
- 핸들 밖 → `default` 커서 복원
- 표 객체 선택 해제 시(클릭, Esc 등) 커서 자동 복원

#### 2. 전체 빌드 검증
- Rust 테스트: **514 passed**, 0 failed ✓
- WASM 빌드: 성공 ✓
- Vite 빌드: 성공 (40 modules) ✓

### 수정 파일
| 파일 | 변경 내용 |
|------|-----------|
| `rhwp-studio/src/engine/input-handler.ts` | onMouseMove 핸들러 + mousemove 리스너 등록/해제 |

### 웹 테스트 시나리오
| 시나리오 | 예상 동작 |
|----------|-----------|
| 표 셀에서 Esc | 표 객체 선택 (파란 테두리 + 8개 핸들) |
| 표 객체 선택에서 Esc | 표 밖으로 커서 이동 |
| 표 객체 선택에서 Enter | 셀 편집 복귀 |
| 표 객체 선택에서 Delete | 표 삭제 |
| F5 셀 선택에서 Esc | 표 객체 선택으로 전환 |
| 표 객체 선택 중 표 밖 클릭 | 표 객체 선택 해제 |
| 핸들 위 마우스 이동 | 방향별 리사이즈 커서 |
| 셀 밖 → 셀 클릭 | 투명선 자동 ON |
| 셀 안 → 셀 밖 클릭 | 투명선 자동 OFF (수동 ON 아닌 경우) |

### 검증
- Rust 테스트 514 passed ✓
- WASM 빌드 성공 ✓
- Vite 빌드 성공 ✓
