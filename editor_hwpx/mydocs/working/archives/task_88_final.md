# 타스크 88 최종 결과보고서: 표 구조 변경 후 저장 시 HWP 파일 손상 수정

## 요약

백로그 B6(표 구조 변경 후 저장 시 HWP 파일 손상) 해결 완료.

## 근본 원인

표 구조 변경(행/열 추가, 셀 나누기) 시 `Cell::new_from_template()`가 템플릿 셀의 `has_para_text=true`를 그대로 복사하여, 빈 셀에 불필요한 PARA_TEXT 레코드([0x000D])가 생성됨. HWP 프로그램은 `cc=1`인 문단에 PARA_TEXT가 있으면 레코드 구조 불일치로 판단하여 파일 손상 오류 발생.

## 수정 내용

| 파일 | 수정 |
|------|------|
| `src/model/table.rs` | `new_from_template()`: `has_para_text: false`, `char_count: 1` |
| `src/model/paragraph.rs` | `new_empty()`: `char_count: 1`, 기본 `LineSeg` 추가 |
| `src/model/table.rs` | `test_cell_new_empty` 기대값 수정 (cc=0 → cc=1) |
| `src/wasm_api.rs` | `test_table_modification_empty_cell_serialization` 테스트 추가 |

## 검증

- 515개 Rust 테스트 통과 (신규 1개 추가)
- 검증 테스트: 빈 문단 80개 검사, 위반 0건
- WASM 빌드 성공
- Vite 빌드 성공

## 브랜치

- 작업 브랜치: `local/task88`
- main 병합 완료: `ce85bb4`
