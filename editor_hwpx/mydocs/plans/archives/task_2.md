# 타스크 2 - 수행계획서: 뷰어 렌더링 엔진 설계

## 목표

HWP 파일을 파싱하여 웹브라우저에서 렌더링할 수 있는 엔진의 아키텍처를 설계한다.
HWP 5.0 스펙을 기반으로 파서 → 중간 표현(IR) → 렌더러 파이프라인을 구성한다.

## HWP 스펙 분석 요약

### 파일 구조
- OLE/CFB 컨테이너 기반
- 주요 스트림: FileHeader, DocInfo, BodyText(Section별), BinData
- 레코드 기반 구조 (TagID + Level + Size + Data)
- 단위: HWPUNIT (1/7200 인치), 문자: UTF-16LE

### 렌더링에 필요한 핵심 데이터
1. **DocInfo**: 글꼴(FACE_NAME), 글자모양(CHAR_SHAPE), 문단모양(PARA_SHAPE), 스타일, 테두리/배경
2. **BodyText**: 페이지정의(PAGE_DEF), 문단헤더/텍스트, 표(TABLE), 그리기개체(SHAPE_COMPONENT_*)
3. **BinData**: 이미지, OLE 개체

### 렌더링 파이프라인
```
HWP 파일 → CFB 파싱 → 레코드 파싱 → 중간 표현(IR) → 렌더 트리 → 그래픽 렌더링
```

## 렌더링 백엔드 후보 분석

### 방안 A: ThorVG (C++ 벡터 그래픽스 엔진)
| 항목 | 내용 |
|------|------|
| 장점 | 경량(~150KB), 벡터 프리미티브 풍부, WASM 공식 지원, MIT 라이선스 |
| 단점 | 공식 Rust 바인딩 없음(C API FFI 필요), 문서 레이아웃 엔진 미제공, C++ 빌드 의존성으로 빌드 복잡도 증가 |
| 통합 방식 | C API → rust-bindgen → Rust FFI → wasm32-unknown-emscripten |
| 선례 | dotlottie-rs (Rust + ThorVG + WASM 프로덕션 사례) |
| 적합도 | 중 - 저수준 렌더링에 강하지만, 레이아웃 엔진은 별도 구현 필요 |

### 방안 B: 순수 Rust 그래픽 라이브러리 (tiny-skia 등)
| 항목 | 내용 |
|------|------|
| 장점 | 순수 Rust로 C++ 의존성 없음, wasm32-unknown-unknown 타겟 빌드 단순, Cargo 생태계 통합 용이 |
| 단점 | ThorVG 대비 기능 제한적일 수 있음, 텍스트 렌더링은 별도 크레이트 필요 |
| 후보 | tiny-skia (2D 래스터라이저), vello (GPU 가속), femtovg (NanoVG 포팅) |
| 적합도 | 중~상 - 빌드 단순성 + Rust 생태계 호환성 우수 |

### 방안 C: Canvas API 직접 호출 (web-sys)
| 항목 | 내용 |
|------|------|
| 장점 | 외부 라이브러리 불필요, 브라우저 네이티브 렌더링, 가장 가벼운 WASM 산출물 |
| 단점 | 렌더링 로직 직접 구현 필요, 네이티브 빌드 불가(웹 전용) |
| 통합 방식 | wasm-bindgen + web-sys → Canvas 2D / SVG API 호출 |
| 적합도 | 중 - 최종 타겟이 웹 전용이므로 실현 가능, 다만 구현량 많음 |

## 범위

- 렌더링 파이프라인 아키텍처 설계
- 렌더링 백엔드 최종 선정 (위 3개 방안 비교 검증)
- 중간 표현(IR) 데이터 구조 설계
- Rust 모듈 구조 설계 (parser, model, renderer)
- WASM ↔ JavaScript 인터페이스 설계
- 1차 지원 범위 정의 (텍스트, 테이블, 이미지, 기본 도형)

## 예상 산출물

- 렌더링 엔진 아키텍처 설계 문서 (`mydocs/tech/rendering_engine_design.md`)
- Rust 모듈 구조 (parser, model, renderer 모듈 뼈대 코드)
- WASM 인터페이스 정의

## 상태

- 작성일: 2026-02-05
- 상태: 승인 완료
