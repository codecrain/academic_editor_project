# 타스크 32 - 1단계 완료 보고서

## 단계: 텍스트 레이아웃 JSON 확장 + 속성 조회 API

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/render_tree.rs` | `TextRunNode`에 `char_shape_id: Option<u32>`, `para_shape_id: Option<u16>` 필드 추가 |
| `src/renderer/layout.rs` | 9개 TextRunNode 생성 위치에 새 필드 전달 (편집용 2곳은 실제 ID, 비편집용 7곳은 None) |
| `src/model/paragraph.rs` | `char_shape_id_at(char_offset)` 메서드 추가 — UTF-16 위치 변환 후 CharShapeRef 검색 |
| `src/wasm_api.rs` | (1) JSON 확장: underline, strikethrough, textColor, charShapeId, paraShapeId 필드 추가 |
| `src/wasm_api.rs` | (2) 속성 조회 API: `getCharPropertiesAt`, `getCellCharPropertiesAt`, `getParaPropertiesAt`, `getCellParaPropertiesAt` |
| `src/wasm_api.rs` | (3) `color_ref_to_css()` 유틸리티 함수 (BGR → CSS hex 변환) |

## 구현 상세

### 1. TextRunNode 확장
- `char_shape_id`: 글자 모양 ID (CharShape 배열 인덱스)
- `para_shape_id`: 문단 모양 ID (ParaShape 배열 인덱스)
- 편집 가능한 텍스트 런에만 실제 ID 전달, 보조 텍스트(각주번호, raw fallback)는 None

### 2. 텍스트 레이아웃 JSON 확장
기존 `getPageTextLayout` JSON에 추가된 필드:
```json
{
  "underline": false,
  "strikethrough": false,
  "textColor": "#000000",
  "charShapeId": 0,
  "paraShapeId": 0
}
```

### 3. 속성 조회 API
- `getCharPropertiesAt(secIdx, paraIdx, charOffset)` → 글자 속성 JSON
- `getCellCharPropertiesAt(secIdx, parentParaIdx, controlIdx, cellIdx, cellParaIdx, charOffset)` → 셀 내 글자 속성
- `getParaPropertiesAt(secIdx, paraIdx)` → 문단 속성 JSON
- `getCellParaPropertiesAt(secIdx, parentParaIdx, controlIdx, cellIdx, cellParaIdx)` → 셀 내 문단 속성

### 4. 색상 변환
`color_ref_to_css()`: HWP BGR `0x00BBGGRR` → CSS hex `#rrggbb`

## 테스트 결과
- 390개 테스트 모두 통과
- 컴파일 경고: 기존 2개 (unused assignment, dead code) — 기존과 동일
