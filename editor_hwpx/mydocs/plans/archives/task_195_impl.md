# 타스크 195 구현 계획서 — 머리말/꼬리말 필드 삽입 및 마당 기능

## 1단계: 필드 마커 삽입 + 렌더링 치환 (Rust)

### 마커 문자 정의
- `\u{0015}` (NAK) → 현재 쪽번호
- `\u{0016}` (SYN) → 총 쪽수
- `\u{0017}` (ETB) → 파일 이름

### Rust 구현
- `header_footer_ops.rs`: `insert_field_in_hf_native(section_idx, is_header, apply_to, hf_para_idx, char_offset, field_type: u8)` 추가
  - field_type: 1=쪽번호, 2=총쪽수, 3=파일이름
  - 해당 마커 문자를 문단 텍스트에 삽입
- `layout.rs`: `layout_header_footer_paragraphs`에서 compose 후 마커 치환
  - `_page_index` → `page_index`로 활성화
  - ComposedParagraph의 텍스트 런에서 마커 문자를 실제 값으로 교체
  - 교체 시 char_style_id 유지 (마커와 동일한 글자 스타일 적용)
- `wasm_api.rs`: `insertFieldInHf` 바인딩

### 검증
- cargo test
- 마커 삽입 후 렌더 트리에서 치환된 텍스트 확인

## 2단계: TS 브릿지 + 도구상자 UI

### TypeScript
- `wasm-bridge.ts`: `insertFieldInHf(sec, isHeader, applyTo, hfParaIdx, charOffset, fieldType)` 메서드
- `page.ts`: `page:insert-field-pagenum`, `page:insert-field-totalpage`, `page:insert-field-filename` 커맨드
- 머리말/꼬리말 도구상자에 [쪽번호] 버튼 추가
- `pkg/rhwp.d.ts`: 타입 선언

### 검증
- TypeScript 컴파일 에러 없음
- 머리말 편집 중 도구상자 버튼으로 쪽번호 삽입 확인

## 3단계: 마당 템플릿 + 메뉴 통합

### 마당 드롭다운 메뉴
- 메뉴바 > 쪽 > 머리말/꼬리말 드롭다운에 마당 목록 추가
- 탭: 양쪽 / 홀수 쪽 / 짝수 쪽
- 11종 템플릿 (5 배치 × 2 스타일 + 빈 템플릿)

### 마당 적용 로직
- 마당 선택 시 해당 applyTo로 머리말/꼬리말 생성 (없으면 새로 생성)
- 기존 텍스트 지우기 → 필드 마커 + 텍스트 삽입
- 정렬 설정: 왼쪽/가운데/오른쪽 → `applyParaFormatInHf`로 문단 정렬 변경
- 좌우 배치(쪽번호+파일이름): 탭 문자(`\t`) + 오른쪽 탭스톱 활용
- 볼드+선 스타일: `applyCharFormatInHf` + 문단 테두리 설정

### 검증
- WASM 빌드
- 다중 페이지 문서(samples/p222.hwp)에서 마당 적용 후 각 페이지별 쪽번호 정확성 확인
- 총 쪽수 필드 검증
