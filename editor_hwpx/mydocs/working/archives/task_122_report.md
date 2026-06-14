# 타스크 122 최종 결과보고서 — 문단 개요 번호/글머리표 렌더링 완성

## 1. 목표

1. **개요 문단(Outline) 렌더링**: SectionDef의 outline_numbering_id를 통한 구역 수준 번호 참조 → 렌더링
2. **글머리표(Bullet) 렌더링**: HWPTAG_BULLET 파싱 → Bullet struct → 렌더링 파이프라인 완성
3. **진단 도구 체계화**: `rhwp diag` 서브커맨드로 문서 구조 진단 정보 출력
4. **로컬 빌드 환경**: Docker 없이 `cargo build`/`cargo test` 로컬 실행
5. **WASM 번호 카운터 버그 수정**: 페이지별 NumberingState 리셋 + pre-advance
6. **옛한글 자모 클러스터 처리**: 초성+중성+종성 시퀀스를 한 글자로 렌더링/폭 계산

## 2. 구현 내역 (7단계 + 추가 수정)

### 1단계: Outline match 분기 수정 ✅
- layout.rs에서 HeadType::Outline을 Number와 동일 경로로 처리

### 2단계: Bullet 파싱 및 데이터 모델 ✅
- `Bullet` struct 추가 (style.rs)
- `parse_bullet()` / `serialize_bullet()` 추가 (doc_info.rs)
- `ResolvedStyleSet`에 `bullets` 필드 추가

### 3단계: Bullet 렌더링 ✅
- layout.rs `apply_paragraph_numbering()` 통합 재작성
- None/Outline|Number/Bullet 3가지 분기 처리

### 4단계: 로컬 빌드 환경 설정 ✅
- `cargo build`/`cargo test` 로컬 실행 확인 (Rust 1.93.1)
- CLAUDE.md에 로컬 빌드 명령 문서화 (Docker는 WASM 전용)

### 5단계: 진단 명령어 체계화 ✅
- `rhwp diag <파일.hwp>` 서브커맨드 추가
- 출력: DocInfo 요약, ParaShape head_type 분포, SectionDef 개요번호, 비None head_type 문단 목록

### 6단계: SectionDef 개요번호 파싱 및 Outline 렌더링 완성 ✅
- `SectionDef.outline_numbering_id` 필드 추가 (document.rs)
- 파서: 바이트 14-15에서 outline_numbering_id 저장 (body_text.rs)
- 직렬화: outline_numbering_id 출력 (control.rs)
- 렌더러: Outline 문단의 numbering_id=0일 때 구역의 outline_numbering_id로 fallback

### 7단계: 통합 테스트 및 검증 ✅
- 571개 테스트 통과, WASM 빌드 성공

### 추가 수정: WASM 번호 카운터 버그 ✅
- **문제**: WASM에서 페이지별 독립 렌더링 시 NumberingState가 누적되어 2페이지 "2.", 3페이지 "4." 표시 (정상: 1., 2.)
- **수정**: `build_page_tree()`에서 NumberingState 리셋 후 이전 페이지 FullParagraph들에 대해 pre-advance
- `resolve_numbering_id()` 공개 함수 추출 (중복 로직 제거)
- Bullet text_distance 조건부 처리 (하드코딩 제거)

### 추가 수정: U+FFFF 이미지 글머리표 SVG 오류 ✅
- **문제**: U+FFFF (이미지 글머리표 마커)가 SVG에 삽입되어 XML 파싱 오류
- **수정**: `bullet_char == '\u{FFFF}'` 가드 추가, `escape_xml()` XML 1.0 유효문자 필터링 재작성

### 추가 수정: 옛한글 자모 클러스터 처리 ✅
- **문자 범위 확장**: `is_hangul()`, `is_cjk_char()` — 확장자모 U+A960-A97F, U+D7B0-D7FF 추가
- **클러스터 그룹핑**: `split_into_clusters()` — 초성+중성+종성 시퀀스를 하나로 묶음
- **렌더링**: SVG(`draw_text`) / Canvas(`draw_text`) 클러스터 단위 `<text>`/`fillText` 출력
- **폭 계산**: `compute_char_positions()` — 클러스터 내부 문자 동일 위치, 시작 문자만 한글 전각 폭
- **텍스트 폭 추정**: `estimate_text_width()` — WASM/네이티브 양쪽 클러스터 인식 (줄바꿈 계산용)
- **WASM 타입 수정**: `hangul_hwp as f64 / 75.0` (HWP→px 변환 누락 수정)

## 3. 핵심 발견

- **개요 문단(Outline)은 구역(Section) 단위로 관리됨**: ParaShape.numbering_id=0이고, SectionDef 바이트 14-15의 numbering_id로 Numbering 참조
- **한컴 도움말 확인**: "개요 번호는 구역 단위로 모양을 바꿀 수 있습니다. 한 구역 안에서는 같은 개요 번호 모양을 가지며"
- **옛한글은 유니코드 결합 자모로 표현**: 초성(1100-115F/A960-A97F) + 중성(1160-11A7/D7B0-D7C6) + 종성(11A8-11FF/D7CB-D7FB) 시퀀스를 폰트가 합성

## 4. 변경 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| src/renderer/layout.rs | Outline/Bullet/Number 통합 렌더링, 자모 클러스터 인식(compute_char_positions/estimate_text_width/split_into_clusters), resolve_numbering_id 추출 |
| src/renderer/svg.rs | escape_xml() XML 1.0 필터링 재작성, 클러스터 단위 draw_text |
| src/renderer/web_canvas.rs | 클러스터 단위 draw_text |
| src/renderer/composer.rs | is_hangul() 확장자모 범위 추가 |
| src/model/style.rs | Bullet struct 추가 |
| src/model/document.rs | DocInfo.bullets, SectionDef.outline_numbering_id 추가 |
| src/parser/doc_info.rs | parse_bullet() + HWPTAG_BULLET 파싱 |
| src/parser/body_text.rs | SectionDef.outline_numbering_id 저장 |
| src/serializer/doc_info.rs | serialize_bullet() + HWPTAG_BULLET 직렬화 |
| src/serializer/control.rs | SectionDef.outline_numbering_id 직렬화 |
| src/renderer/style_resolver.rs | ResolvedStyleSet에 bullets 추가 |
| src/wasm_api.rs | build_page_tree 번호 리셋/pre-advance, outline_numbering_id 전달 |
| src/main.rs | diag 서브커맨드 추가 |
| CLAUDE.md | 로컬 빌드 명령 문서화 |

## 5. 검증 결과

| 항목 | 결과 |
|------|------|
| 기존 571개 테스트 회귀 | 통과 |
| WASM 빌드 | 성공 |
| Outline 렌더링 | 성공 (7수준 모두) |
| Bullet 파싱/렌더링 | 성공 |
| WASM 번호 카운터 | 성공 (페이지별 정상 번호) |
| 옛한글 자모 클러스터 | 성공 (SVG/WASM 양쪽) |
| diag 명령 | 성공 |
| 직렬화 라운드트립 | SectionDef outline_numbering_id 보존 |
| SVG XML 유효성 | 성공 (U+FFFF 등 무효문자 제거) |

## 6. 미해결/향후 개선

- Bullet char `U+FFFF` (이미지 글머리표): 현재 문자 렌더링만 지원, 이미지 글머리표 렌더링은 별도 타스크 필요
- Outline 카운터와 Number 카운터의 독립/공유 정책: 현재 동일 NumberingState 사용, HWP 실제 동작과 비교 검증 필요
- PUA 옛한글(E000-F8FF): 현재 미변환. KS X 1026-1 기준 유니코드 자모로 변환하는 별도 타스크 필요
