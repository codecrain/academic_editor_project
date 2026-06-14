# 타스크 31: 캐럿 상하 이동 및 편집 영역 여백 제한 — 구현 계획서

## 1단계: 캐럿 상하 이동 구현

### 파일: `web/text_selection.js`

**A. `_savedCaretX` 상태 추가 (constructor, line 376 부근)**

```javascript
this._savedCaretX = null;  // 연속 상하 이동 시 원래 X 좌표 유지
```

**B. `_getLineGroups()` 헬퍼 메서드 추가 (line 545 부근)**

runs 배열을 Y 좌표로 줄 그룹화한다. 같은 줄의 runs는 Y 좌표가 ±1px 이내이다.

```javascript
_getLineGroups() {
    const lines = [];
    for (let ri = 0; ri < this.layout.runs.length; ri++) {
        const run = this.layout.runs[ri];
        const existing = lines.find(l => Math.abs(l.y - run.y) <= 1);
        if (existing) {
            existing.runs.push({ ri, run });
        } else {
            lines.push({ y: run.y, runs: [{ ri, run }] });
        }
    }
    lines.sort((a, b) => a.y - b.y);
    return lines;
}
```

**C. `_findClosestCharInLine()` 헬퍼 메서드 추가**

대상 줄에서 targetX에 가장 가까운 문자 위치를 찾는다.

```javascript
_findClosestCharInLine(lineGroup, targetX) {
    let bestDist = Infinity;
    let bestPos = null;
    for (const { ri, run } of lineGroup.runs) {
        for (let ci = 0; ci < run.charX.length; ci++) {
            const dist = Math.abs(run.x + run.charX[ci] - targetX);
            if (dist < bestDist) {
                bestDist = dist;
                bestPos = { runIndex: ri, charIndex: ci };
            }
        }
    }
    return bestPos;
}
```

**D. `_moveCaretUp()` / `_moveCaretDown()` 메서드 추가**

기존 `_moveCaretHome/End()` 패턴 참조 (line 516-545):

```javascript
_moveCaretUp() {
    if (!this.caretPos) return null;
    const curRun = this.layout.runs[this.caretPos.runIndex];
    const targetX = this._savedCaretX !== null ? this._savedCaretX
        : curRun.x + curRun.charX[this.caretPos.charIndex];
    const lines = this._getLineGroups();
    const curLineIdx = lines.findIndex(l => Math.abs(l.y - curRun.y) <= 1);
    if (curLineIdx <= 0) return this.caretPos;
    return this._findClosestCharInLine(lines[curLineIdx - 1], targetX);
}
```

`_moveCaretDown()`도 동일 구조, `curLineIdx + 1` 사용.

**E. keydown 핸들러 연결 (line 719 부근)**

ArrowUp/Down 케이스를 기존 ArrowLeft/Right 패턴에 맞춰 추가한다.
- ArrowUp/Down: `_savedCaretX`를 첫 이동 시 저장
- ArrowLeft/Right/Home/End 및 기타 키: `_savedCaretX = null` 리셋

### 파일: `web/editor.js` (line 250)

ArrowUp/ArrowDown을 text_selection.js에 위임:
```javascript
// 변경 전
['ArrowLeft', 'ArrowRight', 'Home', 'End']
// 변경 후
['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
```

### 검증
- 브라우저에서 ArrowUp/Down 줄 이동 확인
- 연속 상하 이동 후 원래 X 좌표 복원 확인
- Shift+ArrowUp/Down 선택 범위 확장 확인

---

## 2단계: 편집 영역 여백 제한 검증/수정

### 파일: `src/wasm_api.rs` — `reflow_paragraph()` (line 786)

현재 코드:
```rust
let layout = PageLayoutInfo::from_page_def(page_def, &ColumnDef::default(), self.dpi);
let col_area = &layout.column_areas[0];
let available_width = col_area.width - margin_left - margin_right;
```

**검증 항목:**
1. `ColumnDef::default()`가 실제 섹션의 다단 설정과 일치하는지 확인
2. `col_area.width`가 용지폭에서 좌우 페이지 여백을 정확히 뺀 값인지 확인
3. 문단 여백(`margin_left`, `margin_right`)이 올바르게 적용되는지 확인

**예상 수정:**
- `ColumnDef::default()` 대신 실제 섹션의 `column_def` 사용 (다단 레이아웃 지원)
- 기타 여백 관련 버그가 있으면 수정

### 파일: `src/renderer/composer.rs` — `reflow_line_segs()`

`available_width_px` 파라미터가 올바르게 전달되는지, 줄바꿈이 해당 폭 내에서 정확히 동작하는지 검증한다.

### 검증
- 텍스트 입력 시 용지 좌우 여백을 넘지 않는지 확인
- 다양한 여백 설정의 HWP 문서에서 줄바꿈 위치 정확성 확인

---

## 3단계: 통합 테스트 및 마무리

### 검증 항목
1. `docker compose run --rm test` — 전체 테스트 통과
2. `docker compose run --rm wasm` — WASM 빌드 성공
3. 브라우저 검증:
   - ArrowUp/Down 줄 이동 + Shift 선택
   - 텍스트 입력 후 여백 내 줄바꿈 확인
   - 표 셀 내부에서도 캐럿 상하 이동 동작 확인
4. 오늘할일 문서 상태 갱신
5. 최종 결과 보고서 작성
