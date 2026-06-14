# 타스크 193 — 머리말/꼬리말 생성·편집 기본 기능

## 목표

한컴 한글과 동일한 머리말/꼬리말 편집 경험을 웹 편집기에 구현한다.
공공기관 사용자가 문서의 머리말/꼬리말을 생성하고, 텍스트를 입력·편집하며,
쪽번호 필드를 삽입할 수 있도록 한다.

## 현황 분석

### 이미 구현된 부분
- **모델**: Header, Footer, HeaderFooterApply(양쪽/홀수/짝수), MasterPage 구조체 완비
- **파서/시리얼라이저**: HWP 파일에서 머리말/꼬리말 읽기·쓰기 완전 동작
- **페이지네이션**: HeaderFooterRef로 쪽별 활성 머리말/꼬리말 결정 로직 구현
- **렌더러**: build_header/build_footer로 렌더 트리에 Header/Footer 노드 생성
- **여백 설정**: PageSetupDialog에서 marginHeader/marginFooter 편집 가능

### 미구현 부분 (본 타스크 범위)
- **WASM API**: 머리말/꼬리말 생성·조회·수정 API
- **편집 모드**: 머리말/꼬리말 영역 진입·탈출 UX
- **커서 시스템**: 머리말/꼬리말 영역 내 커서 이동·텍스트 입력
- **UI**: 메뉴 커맨드, 편집 모드 시각적 표시(본문 dimming, 영역 표시)

## 구현 범위

### 포함
1. 머리말/꼬리말 생성 (양쪽/홀수/짝수 선택)
2. 편집 모드 진입 (메뉴 또는 더블클릭) / 탈출 (Shift+Esc 또는 닫기 버튼)
3. 편집 모드 시각적 표시: 본문 dimming, `<<머리말(양 쪽)>>` 레이블
4. 텍스트 입력·삭제 (기존 텍스트 편집 엔진 재활용)
5. 쪽번호 필드 삽입
6. 글자/문단 모양 서식 적용

### 제외 (타스크 194)
- 머리말/꼬리말 삭제
- 특정 쪽 감추기
- 머리말/꼬리말마당 (템플릿)
- 이전/다음 머리말/꼬리말 이동

## 기술 설계

### 편집 모드 상태 관리
- CursorState에 `headerFooterMode: 'none' | 'header' | 'footer'` 상태 추가
- DocumentPosition에 `headerFooterParaIndex`, `headerFooterApplyTo` 필드 추가
- 편집 모드 진입 시 커서를 해당 영역의 첫 문단으로 이동
- 기존 텍스트 입력/삭제 로직을 머리말/꼬리말 문단에도 적용 (insertTextInHeaderFooter 등)

### WASM API 추가
- `getHeaderFooter(sectionIdx, isHeader, applyTo)` → JSON (paragraphs 정보)
- `createHeaderFooter(sectionIdx, isHeader, applyTo)` → 빈 머리말/꼬리말 생성
- `insertTextInHeaderFooter(sectionIdx, isHeader, applyTo, paraIdx, charOffset, text)` → 텍스트 삽입
- `deleteTextInHeaderFooter(sectionIdx, isHeader, applyTo, paraIdx, charOffset, count)` → 텍스트 삭제
- `getCursorRectInHeaderFooter(...)` → 커서 좌표 계산
- 머리말/꼬리말 내 기존 커서 기반 편집 API 확장

### 문맥 도구상자 전환 (한컴 방식)
- 기존 `.tb-rotate-group` show/hide 패턴 재활용
- 머리말/꼬리말 편집 모드 진입 시:
  - 기본 도구상자 그룹 숨김
  - `.tb-headerfooter-group` 전용 도구상자 표시
  - 버튼: [머리말/꼬리말] [이전] [다음] [코드 넣기▼] [닫기]
  - 코드 넣기: 쪽번호 등 필드 삽입 드롭다운
- 편집 모드 탈출 시 원래 도구상자 복원

### 렌더링 변경
- 편집 모드 시 본문 영역 반투명 오버레이 (CSS overlay)
- 머리말/꼬리말 영역 점선 테두리 + `<<머리말(양 쪽)>>` 레이블 표시
- 편집 중인 영역만 정상 밝기로 렌더링

### 메뉴/커맨드
- `page:header-create` / `page:footer-create` 커맨드: 생성 + 편집 모드 진입
- `page:header-edit` / `page:footer-edit` 커맨드: 기존 머리말/꼬리말 편집 모드 진입
- `page:headerfooter-close` 커맨드: 편집 모드 탈출
- 기존 stub 커맨드(`page:header-none` 등)를 실제 동작으로 전환

## 리스크

1. **커서 시스템 확장**: 현재 커서가 본문 문단만 지원하므로, 머리말/꼬리말 영역으로의 확장이 필요
2. **텍스트 입력 파이프라인**: 머리말/꼬리말 문단에 대한 입력·삭제가 기존 본문 편집과 동일하게 동작하는지 검증 필요
3. **다중 구역**: 구역별로 다른 머리말/꼬리말이 있을 수 있어, 현재 페이지가 속한 구역을 정확히 판별해야 함
