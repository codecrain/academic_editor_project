# 타스크 122 수행계획서 — 문단 개요 번호/글머리표 렌더링 완성

## 1. 현황 분석

### 구현 완료 항목 (타스크 121에서 구현)
- **파서**: Numbering, NumberingHead, HeadType(None/Outline/Number/Bullet) 파싱 완전 (HWP/HWPX 모두)
- **직렬화**: HWPTAG_NUMBERING, ParaShape attr1 비트 인코딩 완전
- **번호 문단(Number)**: NumberingState 카운터, expand_numbering_format(), 14가지 형식 변환, 렌더링 완전
- **UI → WASM → 모델 파이프라인 완성**:
  - 문단모양 대화상자 확장탭에서 문단 종류(없음/개요/번호/글머리표) 라디오 + 수준(1~7) 드롭다운 구현
  - collectMods() → JSON `{"headType":"Outline","paraLevel":2}` → WASM `parse_para_shape_mods()` → `ParaShapeMods.apply_to()` → ParaShape 저장
  - attr1 비트 23~24(headType), 25~27(paraLevel) 동기화 완전

### 끊어진 지점 (본 타스크에서 해결)
```
UI(대화상자) → WASM API → ParaShape 저장  ✅ 완전 동작
                                ↓
렌더러(layout.rs:4957) → Outline/Bullet → early return ❌ 번호/기호 표시 안 됨
```

### 미구현 항목
| 항목 | 위치 | 상태 |
|------|------|------|
| 개요 문단(Outline) 렌더링 | layout.rs:4957 | HeadType::Outline → early return (번호 미표시) |
| 글머리표(Bullet) 렌더링 | layout.rs:4957 | HeadType::Bullet → early return (기호 미표시) |
| Bullet 데이터 파싱 | doc_info.rs | bullet_count 보존만, HWPTAG_BULLET 파싱 미구현 |

### HWP 스펙 참고사항
- Outline과 Number는 같은 Numbering 정보를 참조하며, 번호 형식 문자열(^1, ^2 등)로 텍스트 생성
- Bullet은 별도 HWPTAG_BULLET 레코드에 글머리 문자(●, ■ 등) 정보 저장
- 두 종류 모두 수준별(1~7) 독립 설정 가능

## 2. 목표

1. **개요 문단(Outline) 렌더링**: 대화상자에서 설정한 headType=Outline + paraLevel이 렌더링에 즉시 반영되도록 함
2. **글머리표(Bullet) 렌더링**: HWPTAG_BULLET 파싱 + 대화상자에서 설정한 headType=Bullet이 렌더링에 반영되도록 함
3. **기존 파이프라인 활용**: UI → WASM → ParaShape 저장은 이미 동작하므로, 렌더러 측만 확장하여 end-to-end 연동 완성

## 3. 구현 계획 (4단계)

### 1단계: 개요 문단(Outline) 렌더링
- layout.rs의 `apply_numbering()` (라인 4956-4961) 에서 HeadType::Outline 처리 추가
- Outline도 Number와 동일하게 numbering_id + para_level 기반으로 Numbering 참조 → 형식 문자열 확장 → 텍스트 삽입
- NumberingState에서 Outline 카운터 관리 (Number와 독립 or 공유 여부 확인)
- 대화상자에서 개요 문단 + 수준 설정 → 저장 → 즉시 렌더링 반영 확인

### 2단계: 글머리표(Bullet) 파싱 및 데이터 모델
- HWP 스펙에서 HWPTAG_BULLET 레코드 구조 확인
- Bullet struct 정의 (model/style.rs): 글머리 문자, char_shape_id 등
- parser/doc_info.rs에 parse_bullet() 함수 추가
- serializer/doc_info.rs에 serialize_bullet() 함수 추가
- ResolvedStyleSet에 bullets 필드 추가

### 3단계: 글머리표(Bullet) 렌더링
- layout.rs에서 HeadType::Bullet 처리 추가
- Bullet struct에서 글머리 문자 조회 → 문단 앞에 기호 삽입
- 수준별 글머리 기호 변경 지원 (●/■/▶/· 등)
- 대화상자에서 글머리표 문단 설정 → 저장 → 즉시 렌더링 반영 확인

### 4단계: 테스트 및 검증
- 개요/번호/글머리표가 포함된 샘플 HWP 파일로 렌더링 결과 검증
- 기존 571개 테스트 회귀 확인
- SVG export로 시각적 결과 확인

## 4. 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| src/model/style.rs | Bullet struct 추가 |
| src/model/doc_info.rs | bullets 필드 추가 |
| src/parser/doc_info.rs | parse_bullet() 추가 |
| src/parser/hwpx/header.rs | HWPX Bullet 파싱 (필요시) |
| src/serializer/doc_info.rs | serialize_bullet() 추가 |
| src/renderer/layout.rs | Outline/Bullet 렌더링 로직 추가 (핵심 변경) |
| src/renderer/style_resolver.rs | ResolvedStyleSet에 bullets 추가 |

※ UI(para-shape-dialog.ts), WASM API(wasm_api.rs), ParaShapeMods(style.rs)는 **변경 불필요** (이미 동작)

## 5. 리스크

- Outline과 Number의 카운터 공유/독립 정책이 HWP 스펙에서 불명확할 수 있음 → 실제 HWP 프로그램 출력과 비교 검증 필요
- Bullet 문자가 유니코드 특수 기호인 경우 폰트 지원 여부 확인 필요
- numbering_id가 0인 상태에서 Outline/Bullet 설정 시 기본 Numbering 할당 로직 필요 여부 확인
