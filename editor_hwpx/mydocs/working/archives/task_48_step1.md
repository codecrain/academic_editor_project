# 타스크 48 단계 1 완료보고서

## 단계: WASM API 추가 — getCursorRect, hitTest (Rust)

## 수행 내용

`wasm_api.rs`에 Phase 2 커서/히트 테스트 API 2개를 WASM + Native 양쪽으로 구현했다.

### 추가된 WASM 메서드 (2개)

| No | API | WASM 시그니처 | 반환 JSON |
|----|-----|-------------|-----------|
| 1 | `getCursorRect` | `(sec, para, charOffset) → String` | `{pageIndex, x, y, height}` |
| 2 | `hitTest` | `(page, x, y) → String` | `{sectionIndex, paragraphIndex, charOffset}` |

### 추가된 헬퍼 메서드

| 메서드 | 용도 |
|--------|------|
| `find_pages_for_paragraph(sec, para) → Vec<u32>` | 문단이 포함된 글로벌 페이지 번호 목록 |
| `find_char_at_x(positions, x) → usize` | 문자 위치 배열에서 x좌표 → 문자 인덱스 |

### 구현 알고리즘

**getCursorRect:**
1. `find_pages_for_paragraph()`로 문단이 포함된 페이지 찾기
2. 각 후보 페이지의 렌더 트리 구축 (`build_page_tree()`)
3. TextRunNode 재귀 순회 → (sec, para, charOffset) 매칭
4. `compute_char_positions()`로 run 내 정확한 x 좌표 보간
5. 빈 문단 폴백: 문단의 첫 TextRun bbox 좌표 반환

**hitTest:**
1. 해당 페이지의 렌더 트리 구축
2. 모든 본문 TextRunNode 수집 (문자 위치 미리 계산)
3. 3단계 히트 검사:
   - (1) 정확한 bbox 히트 → `find_char_at_x()`로 문자 인덱스 계산
   - (2) 같은 줄(y 범위) 내 스냅 → 줄 시작/끝 처리
   - (3) 가장 가까운 줄(y 거리) → x 좌표 매칭
4. 텍스트 없는 페이지 폴백: 구역의 첫 문단 시작 반환

## 검증 결과

| 항목 | 결과 |
|------|------|
| `cargo test` (Docker) | **474 tests 통과** (0 failed) |
| `wasm-pack build` (Docker) | **성공** (26.98s, release 최적화) |
| `pkg/rhwp.d.ts` | 2개 API 시그니처 포함 확인 |
| 기존 API 호환성 | 변경 없음 |

### TypeScript 시그니처 (자동 생성)

```typescript
getCursorRect(section_idx: number, para_idx: number, char_offset: number): string;
hitTest(page_num: number, x: number, y: number): string;
```

## 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/wasm_api.rs` | Phase 2 WASM 메서드 2개 + Native 메서드 3개 + 헬퍼 함수 1개 추가 |
