# 타스크 88 수행계획서: 표 구조 변경 후 저장 시 HWP 파일 손상 수정

## 배경

백로그 B6: 셀 병합/행열 추가삭제 후 저장한 HWP 파일을 한컴오피스에서 열면 "파일이 손상되었습니다" 오류 발생.

## 목표

표 구조 변경(행/열 추가, 셀 나누기) 후 저장한 HWP 파일이 한컴오피스에서 정상적으로 열리도록 직렬화 버그를 수정한다.

## 범위

- Rust 모델 코드(`table.rs`, `paragraph.rs`) 수정
- 검증 테스트 추가(`wasm_api.rs`)
- 프론트엔드 변경 없음

## 근본 원인

1. `Cell::new_from_template()`이 템플릿의 `has_para_text` 값을 그대로 복사하여, 빈 셀에 불필요한 PARA_TEXT 레코드가 생성됨
2. `Paragraph::new_empty()`가 `char_count=0`으로 생성하여 HWP 스펙(최소 cc=1) 위반
3. `Paragraph::new_empty()`에 LineSeg가 없어 PARA_LINE_SEG 레코드 누락

## 영향도

- 낮음 (Rust 모델 코드 2파일 수정, 프론트엔드 변경 없음)
- 기존 동작에 영향 없음 (빈 셀 생성 로직만 수정)

## 일정

- 단일 세션 내 완료 예상
