# 타스크 171: 문단모양 심화 — 구현계획서

## 구현 단계 (2단계)

### 1단계: 서식바 배분/나눔 버튼

**`rhwp-studio/index.html`** — 정렬 버튼 그룹(양쪽 정렬 다음)에 2개 추가:
```html
<button id="btn-align-distribute" class="sb-btn" title="배분 정렬">
  <span class="sb-align sb-al-distribute"></span>
</button>
<button id="btn-align-split" class="sb-btn" title="나눔 정렬">
  <span class="sb-align sb-al-split"></span>
</button>
```

**`rhwp-studio/src/styles/style-bar.css`**:
- `.sb-al-distribute` — 대시선 2개 아이콘 (border-top: dashed)
- `.sb-al-split` — 실선+점선 혼합 아이콘

**`rhwp-studio/src/ui/toolbar.ts`** — setupAlignButtons 배열에 2개 추가

**`rhwp-studio/src/command/commands/format.ts`** — 커맨드 2개 등록:
- `format:align-distribute` → `ih.applyParaAlign('distribute')`
- `format:align-split` → `ih.applyParaAlign('split')`

### 2단계: 줄바꿈 모드 파이프라인

**`src/model/style.rs`** — ParaShapeMods에 2개 필드 추가:
```rust
pub english_break_unit: Option<u8>,  // 0=단어, 1=하이픈, 2=글자
pub korean_break_unit: Option<u8>,   // 0=어절, 1=글자
```
apply_to()에서 attr1 비트 5-6(영어), 7(한글) 조작.

**`src/document_core/commands/formatting.rs`** — build_para_properties_json:
- attr1에서 `(a1 >> 5) & 0x03` (englishBreakUnit), `(a1 >> 7) & 0x01` (koreanBreakUnit) 추출
- JSON에 포함

**`src/document_core/helpers.rs`** — parse_para_shape_mods:
- `"englishBreakUnit"` → `mods.english_break_unit`
- `"koreanBreakUnit"` → `mods.korean_break_unit`

**`rhwp-studio/src/core/types.ts`** — ParaProperties 인터페이스:
```typescript
englishBreakUnit?: number;
koreanBreakUnit?: number;
```

**`rhwp-studio/src/ui/para-shape-dialog.ts`**:
- private 필드: `englishBreakSelect`, `koreanBreakSelect`
- 확장 탭 buildExtendedTab(): "줄 나눔 기준" fieldset 추가
  - 한글: select (어절/글자)
  - 영어: select (단어/하이픈/글자)
- show(): 백엔드 값으로 초기화
- collectMods(): 변경값 수집

## 검증

| 시나리오 | 기대 결과 |
|---------|----------|
| 서식바 배분 정렬 버튼 클릭 | 문단이 배분 정렬됨 (글자 간격 균등 배분) |
| 서식바 나눔 정렬 버튼 클릭 | 문단이 나눔 정렬됨 |
| 문단모양 대화상자에서 줄바꿈 모드 변경 | 한글/영어 줄바꿈 기준 변경됨 |
| 줄바꿈 모드가 설정된 HWP 파일 열기 | 대화상자에 정확한 값 표시 |
| HWP 저장 후 다시 열기 | 줄바꿈 모드 값 유지 |
