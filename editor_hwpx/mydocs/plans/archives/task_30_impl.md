# 타스크 30: 캐럿 위치 정확도 개선 — 구현 계획서

## 1단계: WASM JSON에 폰트 스타일 정보 추가

### 파일: `src/wasm_api.rs`

`get_page_text_layout_native()`의 `collect_text_runs()` 내부에서, 기존 JSON 출력에 폰트 스타일 필드를 추가한다.

**추가 필드:**
- `fontFamily`: 글꼴 이름 (예: "함초롬돋움", "sans-serif")
- `fontSize`: 글꼴 크기 (px)
- `bold`: 진하게 여부
- `italic`: 기울임 여부
- `ratio`: 장평 비율 (1.0 = 100%)
- `letterSpacing`: 자간 (px)

**JSON 출력 예시 (변경 후):**
```json
{
  "text": "안녕하세요",
  "x": 100.0, "y": 200.0, "w": 500.0, "h": 20.0,
  "charX": [0.0, 100.0, 200.0, 300.0, 400.0, 500.0],
  "fontFamily": "함초롬돋움",
  "fontSize": 10.0,
  "bold": false,
  "italic": false,
  "ratio": 1.0,
  "letterSpacing": 0.0,
  "secIdx": 0, "paraIdx": 0, "charStart": 0
}
```

### 검증
- `docker compose run --rm test` — 기존 테스트 통과
- `docker compose run --rm wasm` — WASM 빌드 성공

---

## 2단계: JS에서 measureText 기반 charX 재계산

### 파일: `web/text_selection.js`

`TextLayoutManager` 클래스에 `_remeasureCharPositions()` 메서드를 추가한다.

**알고리즘:**
1. 오프스크린 Canvas 생성 (한 번만)
2. 각 run에 대해:
   a. Canvas 2D context에 run의 폰트 설정 (`${bold} ${italic} ${fontSize}px "${fontFamily}", sans-serif`)
   b. 장평(ratio) != 1.0이면 `ctx.setTransform(ratio, 0, 0, 1, 0, 0)` 후 측정
   c. 텍스트의 각 접두사(prefix)를 `measureText()`로 측정하여 charX 배열 재구성
   d. 자간(letterSpacing) 반영: 각 문자 위치에 누적 letterSpacing 추가
   e. `run.w`를 `charX[charX.length - 1]`로 갱신

**코드 스케치:**
```javascript
_remeasureCharPositions() {
    if (!this._measureCtx) {
        const offscreen = document.createElement('canvas');
        this._measureCtx = offscreen.getContext('2d');
    }
    const ctx = this._measureCtx;

    for (const run of this.runs) {
        if (!run.text || run.text.length === 0) continue;

        const bold = run.bold ? 'bold ' : '';
        const italic = run.italic ? 'italic ' : '';
        const fontSize = run.fontSize || 12;
        const fontFamily = run.fontFamily || 'sans-serif';
        const ratio = run.ratio || 1.0;
        const letterSpacing = run.letterSpacing || 0;

        ctx.font = `${italic}${bold}${fontSize}px "${fontFamily}", sans-serif`;

        const chars = [...run.text];
        const newCharX = [0];

        for (let i = 0; i < chars.length; i++) {
            const prefix = chars.slice(0, i + 1).join('');
            const measured = ctx.measureText(prefix).width * ratio;
            newCharX.push(measured + letterSpacing * (i + 1));
        }

        run.charX = newCharX;
        run.w = newCharX[newCharX.length - 1];
    }
}
```

**호출 위치:** `loadPage()` 끝에서 `this._remeasureCharPositions()` 호출

### 검증
- 브라우저에서 캐럿이 글자 경계에 정확히 위치하는지 확인
- 한글, 영문, 혼합 텍스트에서 모두 정확한지 확인
- 클릭 → 캐럿 위치가 정확한지 확인
- 텍스트 입력 후 캐럿 복원이 정확한지 확인

---

## 3단계: 통합 테스트 및 마무리

### 검증 항목
1. `docker compose run --rm test` — 전체 테스트 통과
2. `docker compose run --rm wasm` — WASM 빌드 성공
3. 브라우저 검증:
   - 다양한 폰트/크기의 문서에서 캐럿 정확도 확인
   - 표 셀 내부 텍스트에서도 캐럿 정확한지 확인
   - 텍스트 선택(드래그) 하이라이트가 글자 범위와 일치하는지 확인
4. 오늘할일 문서 상태 갱신
