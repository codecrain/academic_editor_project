# 타스크 62: 편집 용지 설정 다이얼로그 UI — 수행계획서

## 배경

현재 rhwp-studio에는 메뉴 항목(파일 > 편집 용지, 쪽 > 편집 용지)과 F7 단축키가 정의되어 있으나, 실제 다이얼로그 UI 컴포넌트가 없어 `canExecute: () => false`로 비활성 상태이다. 한컴 웹기안기(WebGian)와 동일한 편집 용지 설정 다이얼로그를 구현하여 용지 종류, 방향, 여백 등을 확인하고 변경할 수 있도록 한다.

## 현재 상태

| 항목 | 상태 |
|------|------|
| 커맨드 정의 | `file:page-setup`, `page:setup` 스텁 존재 (canExecute: false) |
| F7 단축키 | shortcutLabel만 표시, 실제 바인딩 없음 |
| WASM API | `getPageInfo()` (px 단위 조회만 가능), `getPageDef`/`setPageDef` 미존재 |
| 다이얼로그 UI | 프로젝트 전체에 다이얼로그/모달 컴포넌트 없음 |
| WebGian 참조 | `webgian/hancomgian_files/hcwo.css`에 dialog_wrap 패턴 존재 |

## 목표 UI (한컴 웹기안기 동일)

```
┌─ 편집 용지 ──────────────────── [X] ─┐
│                                        │
│  ┌─ 용지 종류 ─────────────────────┐  │
│  │ [A4         ▼]  폭 [210.0] mm   │  │
│  │                  길이 [297.0] mm │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌─ 용지 방향 ──┐ ┌─ 제본 ────────┐  │
│  │ (●)세로 (○)가로│ │(●)한쪽 (○)맞쪽│  │
│  │               │ │(○)위로        │  │
│  └───────────────┘ └───────────────┘  │
│                                        │
│  ┌─ 용지 여백 ─────────────────────┐  │
│  │ 위쪽 [19.4] mm  아래쪽 [14.8] mm│  │
│  │ 왼쪽 [21.2] mm  오른쪽 [19.5] mm│  │
│  │ 머리말[10.6] mm  꼬리말[10.0] mm│  │
│  │ 제본 [0.0] mm                   │  │
│  └──────────────────────────────────┘  │
│                                        │
│  적용 범위: [문서 전체 ▼]             │
│                                        │
│              [확인]    [취소]           │
└────────────────────────────────────────┘
```

## 수정 범위

### Rust (WASM API)
| 파일 | 변경 |
|------|------|
| `src/wasm_api.rs` | `getPageDef(sectionIdx)` — HWPUNIT 원본값 반환, `setPageDef(sectionIdx, json)` — 값 적용 + 재페이지네이션 |

### TypeScript (rhwp-studio)
| 파일 | 변경 |
|------|------|
| `src/ui/dialog.ts` | 신규 — 모달 다이얼로그 베이스 (WebGian 패턴) |
| `src/ui/page-setup-dialog.ts` | 신규 — 편집 용지 다이얼로그 UI |
| `src/core/types.ts` | `PageDef` 인터페이스 추가 (HWPUNIT 원본값) |
| `src/core/wasm-bridge.ts` | `getPageDef()`, `setPageDef()` 메서드 추가 |
| `src/command/commands/file.ts` | `file:page-setup` 활성화, execute 구현 |
| `src/command/commands/page.ts` | `page:setup` 활성화, execute 구현 |
| `src/command/shortcut-map.ts` | F7 단축키 바인딩 추가 |
| `src/style.css` | 모달/다이얼로그 CSS 추가 |
| `src/main.ts` | 다이얼로그 인스턴스 초기화 (필요 시) |

## 주요 기술 사항

### HWPUNIT ↔ mm 변환
- 1인치 = 7200 HWPUNIT = 25.4mm
- `mm = hwpunit × 25.4 / 7200`
- `hwpunit = mm × 7200 / 25.4`

### 용지 종류 프리셋 (HWPUNIT)
| 이름 | 폭 | 길이 |
|------|-----|------|
| A4 | 59528 | 84188 |
| A3 | 84188 | 119055 |
| B4 | 72850 | 103040 |
| B5 | 51502 | 72850 |
| Letter | 62208 | 80496 |
| Legal | 62208 | 102816 |
| 사용자 정의 | 자유 입력 | |

### getPageDef 반환 형식 (JSON)
```json
{
  "width": 59528, "height": 84188,
  "marginLeft": 8504, "marginRight": 8504,
  "marginTop": 5669, "marginBottom": 4252,
  "marginHeader": 4252, "marginFooter": 4252,
  "marginGutter": 0,
  "landscape": false, "binding": 0
}
```

### setPageDef 입력 형식
동일 JSON 구조. 적용 후 WASM 측에서 `convertToEditable()` 재실행하여 전체 재페이지네이션.
