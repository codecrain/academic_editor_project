# 타스크 157 — 4단계 완료 보고서

## 단계 목표

개체 속성 대화상자에 글상자 탭을 추가하여, 글상자의 안쪽 여백과 세로 정렬을 설정할 수 있게 한다.

## 구현 내용

### 개체 타입별 탭 구성

기존 `PicturePropsDialog`를 확장하여 개체 타입(`image`/`shape`)에 따라 탭 구성을 동적으로 변경한다.

| 개체 타입 | 탭 구성 |
|-----------|---------|
| 그림 (image) | 기본, 여백/캡션, 선, 그림, 그림자, 반사, 네온, 얇은 테두리 |
| 글상자 (shape) | 기본, **글상자**, 여백/캡션, 선, 그림자, 반사, 네온, 얇은 테두리 |

### 글상자 탭 UI

```
┌─ 안쪽 여백 ──────────────────────────┐
│ 왼쪽(L): [1.80] mm  오른쪽(R): [1.80] mm  │
│ 위(T):   [0.50] mm  아래(B):   [0.50] mm  │
└──────────────────────────────────────┘
┌─ 글 배치 ───────────────────────────┐
│ 세로 정렬: [위 ▼]                     │
└──────────────────────────────────────┘
```

- 안쪽 여백: 왼/오른 기본 510 HWPUNIT (≈1.8mm), 위/아래 기본 141 HWPUNIT (≈0.5mm)
- 세로 정렬: 위(Top) / 가운데(Center) / 아래(Bottom)

### API 분기

`handleOk()` 에서 개체 타입에 따라 `setPictureProperties` 또는 `setShapeProperties`를 호출한다. 글상자 탭의 여백/정렬 값은 shape 타입일 때만 수집하여 전달한다.

## 변경 파일 (2개, 3단계 이후 추가분)

| 파일 | 변경 내용 |
|------|-----------|
| `rhwp-studio/src/ui/picture-props-dialog.ts` | `open()` type 매개변수 추가, `rebuildTabs()` 메서드로 동적 탭 구성, `buildTextboxPanel()` 신규, `handleOk()`/`populateFromProps()` shape 분기 추가 |
| `rhwp-studio/src/command/commands/insert.ts` | `insert:picture-props`에서 `ref.type` 전달 |

## 검증

- **Rust 테스트**: 608 passed, 0 failed
- **WASM 빌드**: 성공
- **TypeScript 타입 검사**: 에러 없음 (0개)
