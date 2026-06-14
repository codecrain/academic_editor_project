# 타스크 93: hwplib 기준 도형 파싱 정합성 수정

## 배경

hwplib(Java HWP 라이브러리) 소스코드와 비교 검증한 결과, 도형별 파싱에 6건의 불일치가 발견되었다.
기존 border.width 버그(INT16→INT32)와 동일한 패턴으로, 필드 크기 오류로 인한 바이트 오프셋 밀림이 다른 보정 로직(>>16 시프트 등)으로 우연히 상쇄되는 구조가 반복되고 있다.

## 참조 소스

- hwplib 도형 모델: `/home/edward/vsworks/shwp/hwplib/src/main/java/kr/dogfoot/hwplib/object/bodytext/control/gso/shapecomponenteach/`
- hwplib 도형 리더: `/home/edward/vsworks/shwp/hwplib/src/main/java/kr/dogfoot/hwplib/reader/bodytext/paragraph/control/gso/`

## 불일치 항목

| # | 도형 | 불일치 | hwplib (정확) | 우리 코드 (현재) | 영향 |
|---|------|--------|-------------|----------------|------|
| 1 | LINE | 5번째 필드 크기 | `readSInt4()` 4B (startedRightOrBottom boolean) | `read_u16()` 2B (attr) | 2바이트 밀림 |
| 2 | RECT | 좌표 읽기 순서 | x1,y1,x2,y2,x3,y3,x4,y4 (인터리브 쌍) | x[0..4],y[0..4] (X 전체 → Y 전체) | 좌표 뒤바뀜 |
| 3 | POLYGON | count 타입 | `readSInt4()` 4B | `read_i16()` 2B | 2바이트 밀림 |
| 4 | POLYGON | 좌표값 | plain i32 (HWPUNIT) | `i32 >> 16` (고정소수점 가정) | >>16이 밀림 보정 |
| 5 | CURVE | count/좌표/패딩 | i32 count + plain i32 + `skip(4)` | i16 count + >>16, 패딩 없음 | 동일 패턴 |
| 6 | ARC | 첫 필드 | `readUInt1()` 1B (arcType enum) | `read_u32()` 4B (attr) | 3바이트 밀림 |
| - | ELLIPSE | - | 일치 | 일치 | 없음 |

## 수정 대상 파일

| 파일 | 수정 내용 |
|------|----------|
| `src/model/shape.rs` | LineShape.attr→started_right_or_bottom, ArcShape.attr→arc_type(u8) |
| `src/parser/control.rs` | 6개 도형 파서 함수 수정 |
| `src/renderer/layout.rs` | 변경된 필드명/타입에 맞춰 렌더러 코드 조정 |

## 검증 방법

- `docker compose run --rm test` — 532개 기존 테스트 통과
- `docker compose run --rm dev cargo run -- export-svg samples/basic/KTX.hwp` — 도형 렌더링 정상 확인
- 추가 샘플(다각형/곡선/호 포함) SVG 출력 비교
