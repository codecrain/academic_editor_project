# Task 226: 쪽 > 구역 설정 대화상자 구현

## 목표

쪽 메뉴에 "구역 설정(E)..." 메뉴 항목을 추가하고, 현재 캐럿 위치의 구역 설정을 조회/수정할 수 있는 대화상자를 구현한다.

## 한컴 구역설정 대화상자 구성

```
┌─ 구역 설정 ─────────────────────────────┐
│ 시작 쪽 번호                             │
│   종류(N): [이어서 ▼]                    │
│ 개체 시작 번호                           │
│   그림(P): [이어서 ▼]                    │
│   표(A):   [이어서 ▼]                    │
│   수식(E): [이어서 ▼]                    │
│ 기타                                     │
│   □ 첫 쪽에만 머리말/꼬리말 감추기(H)     │
│   □ 첫 쪽에만 바탕쪽 감추기(M)            │
│   □ 첫 쪽에만 테두리/배경 감추기(E)       │
│   ☑ 빈 줄 감추기(L)                      │
│   단 사이 간격(G): [11.3 pt ↕]           │
│   기본 탭 간격(I): [40.0 pt ↕]           │
│   적용 범위(Y): [문서 전체 ▼]             │
│                          [설정(D)] [취소] │
└──────────────────────────────────────────┘
```

## SectionDef 모델 매핑

| 대화상자 항목 | SectionDef 필드 | 타입 |
|--------------|-----------------|------|
| 시작 쪽 번호 종류 | page_num | u16 (0=이어서) |
| 그림 시작 번호 | picture_num | u16 (0=이어서) |
| 표 시작 번호 | table_num | u16 (0=이어서) |
| 수식 시작 번호 | equation_num | u16 (0=이어서) |
| 머리말/꼬리말 감추기 | hide_header, hide_footer | bool |
| 바탕쪽 감추기 | hide_master_page | bool |
| 테두리/배경 감추기 | hide_border, hide_fill | bool |
| 빈 줄 감추기 | hide_empty_line | bool |
| 단 사이 간격 | column_spacing | HwpUnit16 |
| 기본 탭 간격 | default_tab_spacing | HwpUnit |

## 수행 계획

### 1단계: WASM API 추가 (Rust)

- `get_section_def(section_idx)` → SectionDef를 JSON으로 반환
- `set_section_def(section_idx, json)` → SectionDef 변경 후 재페이지네이션
- 기존 `page:setup` 커맨드의 sectionIdx=0 하드코딩도 캐럿 위치 기반으로 수정

### 2단계: 메뉴 항목 + 커맨드 등록 (HTML/TypeScript)

- `index.html`: 쪽 메뉴에 "구역 설정(E)..." 항목 추가
- `page.ts`: `page:section-settings` 커맨드 등록 (캐럿 sectionIndex 전달)
- `wasm-bridge.ts`: `getSectionDef()` / `setSectionDef()` 래퍼 추가

### 3단계: 구역설정 대화상자 구현 (TypeScript)

- `section-settings-dialog.ts` 신규 생성
- 한컴 UI와 동일한 레이아웃
- 확인 시 WASM API로 변경 적용 + 재렌더링
