# 타스크 82 수행계획서: 컨텍스트 메뉴 인프라 + 표 우클릭 메뉴

## 1. 목표

우클릭 컨텍스트 메뉴 시스템을 구축하고, 표 셀 내 우클릭 시 표 편집 메뉴를 표시한다.

## 2. 현재 상태 분석

### 기존 인프라
- **CommandDispatcher**: 커맨드 실행/활성 상태 조회 완비 (`dispatcher.ts`)
- **CommandRegistry**: 카테고리별 커맨드 조회 가능 (`registry.ts`, `getByCategory()`)
- **table.ts**: `table:*` 커맨드 21개 스텁 등록 (`canExecute: () => false`)
- **InputHandler**: mousedown 이벤트만 처리, contextmenu 이벤트 미처리
- **MenuBar**: 드롭다운 메뉴 시스템 구현 완료 (참고 패턴)
- **스타일**: `.md-item`, `.md-sep` 등 메뉴 항목 스타일 이미 정의됨

### 부족한 부분
- 컨텍스트 메뉴 클래스 없음
- contextmenu 이벤트 핸들러 없음
- 브라우저 기본 컨텍스트 메뉴 억제 없음
- table 커맨드의 canExecute가 모두 false (실행 불가)

## 3. 구현 범위

### 3-1. ContextMenu 클래스 (`rhwp-studio/src/ui/context-menu.ts`)
- 메뉴 항목 목록을 받아 DOM 생성/표시
- clientX/Y 기반 위치 지정
- ESC 키 / 외부 클릭 시 닫기
- CommandDispatcher 연동: canExecute 체크로 비활성 항목 표시
- 메뉴 항목 클릭 시 커맨드 실행 후 메뉴 닫기
- 구분선 지원

### 3-2. InputHandler 확장
- `contextmenu` 이벤트 핸들러 추가
- `e.preventDefault()`로 브라우저 기본 메뉴 억제
- 우클릭 위치 hitTest → 표 셀 내부/외부 판별
- 표 셀 내: 표 편집 전용 메뉴 표시
- 표 밖: 일반 편집 메뉴 (잘라내기/복사/붙여넣기) 표시

### 3-3. table 커맨드 canExecute 활성화
- 표 셀 내부에서만 활성화되도록 canExecute 조건 추가
- 아직 execute 구현이 없는 항목은 canExecute만 설정 (메뉴에 표시되되 클릭 시 동작 없음)

### 3-4. CSS 스타일
- 기존 `.md-item`, `.md-sep` 스타일을 재활용
- 컨텍스트 메뉴 컨테이너 스타일 추가 (position:fixed, z-index)

## 4. 영향도

- **낮음**: 신규 기능 추가, 기존 동작 변경 없음
- 기존 mousedown 핸들러에 영향 없음
- 컨텍스트 메뉴는 독립적인 DOM 요소

## 5. 테스트 방안

- Rust 테스트: 변경 없으므로 기존 테스트 통과 확인
- WASM 빌드: 정상 빌드 확인
- 웹 검증:
  - 표 셀 내 우클릭 → 표 편집 메뉴 표시
  - 표 밖 우클릭 → 일반 편집 메뉴 표시
  - ESC / 외부 클릭 → 메뉴 닫기
  - 비활성 항목 회색 표시
  - 브라우저 기본 메뉴가 나타나지 않음

## 6. 브랜치

- `local/table-edit` → `local/task82`
- 완료 후 `local/table-edit`에 병합
