# 타스크 195 수행계획서 — 머리말/꼬리말 필드 삽입 및 마당 기능

## 목표

머리말/꼬리말 편집 모드에서 쪽번호·총쪽수·파일이름 등 필드를 삽입하고, 렌더링 시 실제 값으로 치환하여 표시하는 기능 구현. 한컴의 "머리말/꼬리말마당" 템플릿 기능의 핵심인 필드 삽입·렌더링을 구현한다.

## 현황 분석

| 항목 | 상태 |
|------|------|
| PageNumberPos 모델 | 구현 완료 (구역 레벨 쪽번호 위치 설정) |
| PageNumberPos 렌더링 | 구현 완료 (`build_page_number`) |
| 머리말 텍스트 삽입 | 구현 완료 (순수 텍스트만) |
| 머리말 내 필드 삽입 | **미구현** |
| 필드 렌더링 | **미구현** |
| 머리말/꼬리말마당 UI | **미구현** |

## 한컴 머리말/꼬리말마당 기능 (참고)

경로: 쪽 > 머리말/꼬리말 > 머리말/꼬리말마당 목록

| 템플릿 | 설명 |
|--------|------|
| (없음) | 빈 머리말/꼬리말 직접 편집 |
| 가운데에 쪽 번호 넣기 | 가운데 정렬 쪽번호 |
| 왼쪽에 쪽 번호 넣기 | 왼쪽 정렬 쪽번호 |
| 오른쪽에 쪽 번호 넣기 | 오른쪽 정렬 쪽번호 |
| 파일 이름 넣기 | 파일명 필드 삽입 |
| 쪽 번호와 파일 이름 함께 넣기 | 왼쪽 쪽번호 + 오른쪽 파일명 |
| 머리말 영역을 음영으로 처리하기 | 배경색 + 선 |
| 선 넣기 | 밑줄선 |

핵심: 마당 기능은 **필드 코드 삽입 + 문단 서식 설정**의 조합이다.

## HWP 필드 시스템

### HWP 스펙 필드 타입 (표 130)

| ID | 타입 | 설명 | 우선순위 |
|----|------|------|----------|
| `%dte` | FIELD_DATE | 현재 날짜/시간 | 후순위 |
| `%ddt` | FIELD_DOCDATE | 문서 작성일 | 후순위 |
| `%pat` | FIELD_PATH | 파일 경로/이름 | **1차** |
| `%smr` | FIELD_SUMMARY | 문서 요약 | 후순위 |
| `%usr` | FIELD_USERINFO | 사용자 정보 | 후순위 |
| - | PAGE_NUM | 현재 쪽번호 | **1차** |
| - | TOTAL_PAGES | 총 쪽수 | **1차** |

### 구현 접근법: 마커 문자 기반

머리말/꼬리말 문단 텍스트에 유니코드 Private Use Area 마커 삽입, 렌더링 시 실제 값으로 치환.

| 마커 | 의미 | 치환 값 |
|------|------|---------|
| `\u{0015}` | 현재 쪽번호 | `page_index + 1` (format 적용) |
| `\u{0016}` | 총 쪽수 | `total_pages` |
| `\u{0017}` | 파일 이름 | 문서 파일명 |

## 구현 단계

### 1단계: 필드 마커 삽입 + 렌더링 (Rust + WASM)

- Rust: `insert_field_in_hf_native(section_idx, is_header, apply_to, hf_para_idx, char_offset, field_type)` — 머리말 문단에 마커 문자 삽입
- 렌더링: `layout_header_footer_paragraphs`에서 compose 결과의 마커를 실제 값으로 치환
  - `_page_index` 파라미터 활용 (이미 존재)
  - 치환 후 ComposedLine 런 재구성 필요 (마커 1글자 → N글자)
- WASM: `insertFieldInHf` 바인딩
- TS: wasm-bridge 메서드

### 2단계: 도구상자 UI + 마당 커맨드

- 머리말/꼬리말 도구상자에 [쪽번호 넣기] 버튼 추가
- `page:insert-field-pagenum`, `page:insert-field-totalpage`, `page:insert-field-filename` 커맨드
- 머리말/꼬리말 생성 대화상자에 마당 템플릿 목록 추가 (선택)

### 3단계: 검증 + 다중 페이지 테스트

- 다중 페이지 문서 (samples/p222.hwp) 에서 페이지별 번호 정확성 검증
- 쪽번호 서식 (아라비아, 로마 숫자 등) 확인 — `format_page_number` 유틸리티 활용
- 총 쪽수 필드 정확성 검증

## 수정 대상 파일

### Rust
- `src/document_core/commands/header_footer_ops.rs` — 필드 마커 삽입 함수
- `src/renderer/layout.rs` — `layout_header_footer_paragraphs` 치환 로직
- `src/wasm_api.rs` — WASM 바인딩

### TypeScript
- `rhwp-studio/src/core/wasm-bridge.ts` — 브릿지 메서드
- `rhwp-studio/src/command/commands/page.ts` — 필드 삽입 커맨드
- `rhwp-studio/index.html` — 도구상자 버튼
- `pkg/rhwp.d.ts` — 타입 선언

## 위험 요소

1. 마커 문자 치환 시 글자 폭 변경 → ComposedLine 런 재계성 필요 (1글자 → N글자)
2. 총 쪽수 필드는 pagination 완료 후에만 확정 → 렌더링 시점에서 처리
3. 쪽번호 서식 처리 — 기존 `format_page_number` 유틸리티 활용 가능
4. 파일 이름 필드 — DocumentCore에 파일명 정보 필요 (현재 미보관 가능성)
