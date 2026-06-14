# 타스크 84 수행계획서: 표/셀 속성 다이얼로그

## 목표

HWP의 표/셀 속성 대화상자를 구현한다. HWP 표준 6개 탭(기본, 여백/캡션, 테두리, 배경, 표, 셀) UI를 모두 구축하고, 현재 구현 가능한 속성은 WASM API를 통해 조회/수정하며, 미구현 속성도 UI에 포함시켜 향후 기능과 연결할 수 있도록 설계한다.

## 참조

- HWP 도움말: `mydocs/manual/hwp/Help/extracted/table/tableattribute/`
- 한컴 웹기안기: `webgian/hancomgian_files/hwpctrlmain.html`
- 기존 다이얼로그 패턴: `rhwp-studio/src/ui/dialog.ts`, `page-setup-dialog.ts`

## 현재 상태

### 이미 있는 것
- Table/Cell 구조체에 핵심 속성 필드 존재 (`src/model/table.rs`)
  - Table: `cell_spacing`, `padding`, `page_break`, `repeat_header`, `border_fill_id`
  - Cell: `width`, `height`, `padding`, `vertical_align`, `text_direction`, `is_header`, `border_fill_id`
- ModalDialog 기반 탭 없는 패턴 확립 (`dialog.ts`, `page-setup-dialog.ts`)
- `table:cell-props` 커맨드 스텁 등록 (`table.ts`)
- getCellInfo, getTableDimensions, getTableCellBboxes 조회 API
- 컨텍스트 메뉴에서 "표/셀 속성" 항목 연결 대기

### 구현 필요
- WASM API: 셀 속성 조회 (`getCellProperties`), 셀 속성 수정 (`setCellProperties`)
- WASM API: 표 속성 조회 (`getTableProperties`), 표 속성 수정 (`setTableProperties`)
- TypeScript 브릿지 메서드
- `TableCellPropsDialog` 다이얼로그 클래스 (탭 UI 포함)
- `table:cell-props` 커맨드에서 다이얼로그 표시

## 다이얼로그 탭 구성 (HWP 표준 6개 탭)

### 탭 1: 기본
| 항목 | 타입 | 모델 필드 | 구현 상태 |
|------|------|-----------|-----------|
| 너비 | 숫자 (mm) | Table: ctrl_data 내 width | 향후 |
| 높이 | 숫자 (mm) | Table: ctrl_data 내 height | 향후 |
| 위치 (글자처럼/가로/세로) | 드롭다운 | Table: ctrl_data attr | 향후 |
| 본문과의 배치 | 라디오 그룹 | Table: ctrl_data attr | 향후 |
| 개체 보호 | 체크박스 | Table: attr | 향후 |

### 탭 2: 여백/캡션
| 항목 | 타입 | 모델 필드 | 구현 상태 |
|------|------|-----------|-----------|
| 바깥 여백 (상/하/좌/우) | 숫자 (mm) | Table: ctrl_data 내 margin | 향후 |
| 캡션 위치 | 드롭다운 | Table: caption | 향후 |
| 캡션 크기 | 숫자 (mm) | Table: caption | 향후 |
| 캡션 간격 | 숫자 (mm) | Table: caption | 향후 |

### 탭 3: 테두리
| 항목 | 타입 | 모델 필드 | 구현 상태 |
|------|------|-----------|-----------|
| 선 종류 | 드롭다운 | BorderFill | 향후 |
| 선 굵기 | 드롭다운 | BorderFill | 향후 |
| 선 색 | 색상 선택 | BorderFill | 향후 |
| 미리보기 (상/하/좌/우/모두) | 버튼 그룹 | BorderFill | 향후 |
| 셀 간격 | 숫자 (mm) | Table: cell_spacing | **구현** |

### 탭 4: 배경
| 항목 | 타입 | 모델 필드 | 구현 상태 |
|------|------|-----------|-----------|
| 채우기 없음 | 라디오 | BorderFill | 향후 |
| 면 색 | 색상 선택 | BorderFill | 향후 |
| 무늬 색/모양 | 드롭다운 | BorderFill | 향후 |
| 그러데이션 | 복합 컨트롤 | BorderFill | 향후 |
| 그림 | 파일 선택 | BorderFill | 향후 |

### 탭 5: 표
| 항목 | 타입 | 모델 필드 | 구현 상태 |
|------|------|-----------|-----------|
| 쪽 경계에서 나눔 | 라디오 (나눔/셀단위/나누지않음) | Table: page_break | **구현** |
| 제목 줄 자동 반복 | 체크박스 | Table: repeat_header | **구현** |
| 모든 셀 안여백 (상/하/좌/우) | 숫자 (mm) | Table: padding | **구현** |

### 탭 6: 셀
| 항목 | 타입 | 모델 필드 | 구현 상태 |
|------|------|-----------|-----------|
| 셀 크기 적용 | 체크박스 | — | UI only |
| 너비 | 숫자 (mm) | Cell: width | **구현** |
| 높이 | 숫자 (mm) | Cell: height | **구현** |
| 안여백 지정 | 체크박스 + 숫자 (상/하/좌/우) | Cell: padding | **구현** |
| 세로 정렬 | 버튼 그룹 (위/가운데/아래) | Cell: vertical_align | **구현** |
| 세로쓰기 | 버튼 그룹 (영문눕힘/영문세움) | Cell: text_direction | **구현** |
| 한 줄로 입력 | 체크박스 | — | 향후 |
| 셀 보호 | 체크박스 | — | 향후 |
| 제목 셀 | 체크박스 | Cell: is_header | **구현** |
| 필드 이름 | 텍스트 입력 | — | 향후 |
| 양식 모드에서 편집 가능 | 체크박스 | — | 향후 |

## 설계 원칙

1. **전체 UI 선구축**: 6개 탭 모두 UI를 구현한다. 미구현 기능의 컨트롤은 disabled 상태로 표시하되, 향후 WASM API 연결 시 활성화할 수 있도록 필드 참조를 보관한다.
2. **구현 가능 속성 우선**: 표 탭(page_break, repeat_header, padding)과 셀 탭(width, height, padding, vertical_align, text_direction, is_header)은 WASM API를 통해 실제 조회/수정을 지원한다.
3. **탭 전환 UI**: ModalDialog를 확장하여 탭 헤더 + 탭 패널 구조를 지원한다.

## 변경 범위

| 파일 | 변경 |
|------|------|
| `src/wasm_api.rs` | `getCellProperties`, `setCellProperties`, `getTableProperties`, `setTableProperties` API 추가 |
| `rhwp-studio/src/core/types.ts` | `CellProperties`, `TableProperties` 인터페이스 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 4개 브릿지 메서드 추가 |
| `rhwp-studio/src/ui/table-cell-props-dialog.ts` | 신규 — 6탭 다이얼로그 클래스 |
| `rhwp-studio/src/command/commands/table.ts` | `table:cell-props` execute 구현 |
| `rhwp-studio/src/style.css` | 탭 UI 스타일 + 다이얼로그 내 컨트롤 스타일 추가 |

## 영향도

- 중간 (WASM API 4개 추가, 프론트엔드 다이얼로그 1개 신규)
- 기존 동작 변경 없음 (신규 기능)

## 브랜치

- `local/table-edit` → `local/task84`
