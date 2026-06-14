# 타스크 70 수행 계획서: 머리말/꼬리말 렌더링 및 쪽 번호 처리

## 배경

한컴 HWP 문서에는 머리말(Header)과 꼬리말(Footer) 컨트롤이 포함되어 있으며,
대부분의 공문서·보고서에서 꼬리말 영역에 쪽 번호를 표시한다.

현재 구현 상태:
- **파싱/모델**: Header, Footer, PageNumberPos 구조체 및 파싱 완성
- **페이지 영역**: header_area, footer_area 영역 계산 완성 (타스크 69)
- **렌더 노드**: Header/Footer 노드 생성되지만 **자식 콘텐츠 없음**
- **미구현**: 페이지네이션 시 머리말/꼬리말 할당, 레이아웃 배치, 쪽 번호 텍스트 생성

## 문제

1. `PageContent.header_paragraphs / footer_paragraphs`가 항상 `Vec::new()`
2. `RenderNodeType::Header / Footer` 노드에 자식(텍스트 렌더 노드)이 없음
3. `PageNumberPos` 컨트롤 위치에 실제 페이지 번호 텍스트가 생성되지 않음

### HWP 머리말/꼬리말 구조 (한컴 도움말)

- 머리말: 쪽 상단 고정 반복 콘텐츠 (header_area 영역)
- 꼬리말: 쪽 하단 고정 반복 콘텐츠 (footer_area 영역)
- 적용 범위: Both(양쪽) / Even(짝수) / Odd(홀수)
- 쪽 번호: 10가지 위치, 다양한 번호 형식 (아라비아/로마자/한글 등)
- 감추기: PageHide 컨트롤로 특정 쪽에서 감추기 가능

## 수정 범위

| 파일 | 작업 |
|------|------|
| `src/renderer/pagination.rs` | 머리말/꼬리말 컨트롤 수집 및 페이지별 할당 |
| `src/renderer/layout.rs` | Header/Footer 노드에 문단 콘텐츠 배치 |
| `src/renderer/layout.rs` | PageNumberPos → 쪽 번호 텍스트 렌더 노드 생성 |

## 검증

1. 488개 Rust 테스트 통과
2. SVG 내보내기로 머리말/꼬리말 텍스트 렌더링 확인
3. 쪽 번호가 올바른 위치에 올바른 형식으로 표시되는지 확인
4. 기존 문서 렌더링 회귀 없음
