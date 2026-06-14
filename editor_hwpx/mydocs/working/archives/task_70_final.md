# 타스크 70 최종 완료 보고서

## 머리말/꼬리말 렌더링 및 쪽 번호 처리

### 작업 요약

HWP 문서의 머리말(Header), 꼬리말(Footer) 영역에 실제 콘텐츠를 렌더링하고, 쪽 번호(PageNumberPos) 컨트롤 처리를 구현하였다.

### 수정 파일

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `src/renderer/pagination.rs` | HeaderFooterRef 구조체, 페이지별 Header/Footer 할당, PageNumberPos 수집 | +130줄 |
| `src/renderer/layout.rs` | Header/Footer 콘텐츠 렌더링, Table 포함 Footer 처리, 쪽 번호 텍스트 렌더링 | +200줄 |

### 구현 내용

#### 1. 페이지별 머리말/꼬리말 할당 (pagination.rs)

- `HeaderFooterRef` 구조체 추가: 문단 인덱스 + 컨트롤 인덱스로 Header/Footer 참조
- `PageContent`에 `active_header`, `active_footer`, `page_number_pos` 필드 추가
- 전체 문단에서 `Control::Header`, `Control::Footer`, `Control::PageNumberPos` 사전 수집
- 페이지별로 해당 페이지에 포함된 문단까지의 마지막 Header/Footer를 적용
  - `HeaderFooterApply` (Both/Even/Odd) 지원
  - 홀수/짝수 페이지 번호에 따라 올바른 머리말/꼬리말 선택

**핵심 버그 수정**: 기존에는 전체 섹션의 마지막 Footer만 모든 페이지에 적용하여 콘텐츠가 있는 Footer가 빈 Footer에 덮어씌워지는 문제가 있었다. 페이지별 문단 인덱스 기반 할당으로 수정.

#### 2. Header/Footer 콘텐츠 렌더링 (layout.rs)

- `build_render_tree()`에서 Header/Footer 노드 생성 시 `active_header`/`active_footer` 참조
- `layout_header_footer_paragraphs()` 함수로 Header/Footer 내부 문단 렌더링
  - 일반 텍스트 문단: `layout_paragraph()` 재사용
  - **Table 포함 문단**: `layout_table()` 호출 (k-water-rfp.hwp의 Footer가 Table 구조)
- Header/Footer 영역(`header_area`/`footer_area`) 내에서 y좌표 기반 배치

#### 3. 쪽 번호(PageNumberPos) 렌더링

- `format_page_number()`: 아라비아 숫자, 로마 대문자/소문자, 원문자 포맷 지원
- `to_roman_upper()`, `to_roman_lower()`, `to_circle_number()` 헬퍼 함수
- position 값에 따른 위치 결정:
  - 0: 표시 안 함 (skip)
  - 1~3: header_area (왼쪽/가운데/오른쪽)
  - 4~6: footer_area (왼쪽/가운데/오른쪽)
- 테스트 파일들은 position=0이라 화면에 표시되지 않지만, 코드 인프라 완비

### 검증 결과

| 항목 | 결과 |
|------|------|
| Rust 테스트 | 488개 전체 통과 |
| k-water-rfp.hwp SVG 내보내기 | 29페이지 정상 (Footer 테이블 테두리 렌더링 확인) |
| hwp-multi-001.hwp SVG 내보내기 | 11페이지 정상 |
| 기존 문서 회귀 | 없음 |

### 알려진 한계

1. **Footer 테이블 셀 내 필드 코드**: Footer의 Table 셀에서 필드 코드(0x0012)로 삽입된 쪽 번호 텍스트는 아직 치환되지 않는다. 필드 코드 치환은 별도 타스크로 진행 필요.
2. **PageNumberPos position=0**: 현재 테스트 파일들이 모두 position=0이라 PageNumberPos 렌더링의 시각적 확인은 미완. 코드 로직은 구현 완료.

### 작업 브랜치

`local/task70`
