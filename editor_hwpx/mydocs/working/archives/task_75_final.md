# 타스크 75 최종 결과보고서: 표 앞 텍스트가 표 아래에 렌더링되는 문제 수정

## 요약

`hwp-multi-001.hwp` 2페이지에서 문단28의 텍스트 2줄이 표8 아래에 렌더링되거나 누락되던 문제를 수정하였다. 표의 CTRL_HEADER `vertical_offset` 값을 기반으로, 자리차지 배치에서 표가 문단 시작점 아래에 위치할 때 텍스트를 표 앞에 배치하도록 페이지네이션 로직을 개선하였다.

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/pagination.rs` | `find_table_char_position`/`find_line_for_char_pos` → `get_table_vertical_offset`로 교체. vertical_offset > 0이면 모든 텍스트를 표 앞에 배치 |
| `src/wasm_api.rs` | 테스트 수정 — PartialParagraph(start_line=0)이 Table 앞에 올 수 있도록 허용 |

## 핵심 원인

문단28은 표 제어문자와 텍스트를 동시에 포함하는 혼합 문단이다. 표의 제어문자는 char 스트림 시작(code unit 0~7)에 위치하지만, 표의 **자리차지** 배치 속성과 `vertical_offset = 9.77mm`로 인해 표는 물리적으로 텍스트 아래에 위치해야 한다.

기존의 `char_offsets` 기반 접근은 문자 스트림의 논리적 위치만 분석하여 "표가 텍스트 앞"으로 판단했으나, 실제 물리적 배치는 표의 CTRL_HEADER `vertical_offset`에 의해 결정된다.

## 해결 방식

```
vertical_offset > 0 → 텍스트 전체를 표 앞에 배치 (PartialParagraph + Table)
vertical_offset = 0 → 텍스트를 표 뒤에 배치 (Table + PartialParagraph, 타스크 66 동작 유지)
```

## 검증 결과

- 488개 Rust 테스트 통과
- SVG 내보내기: hwp-multi-001.hwp 2페이지 텍스트 2줄이 표8 위에 정상 렌더링
- 회귀 검사: img-start-001.hwp, hwp-multi-001.hwp 전 페이지 정상
- WASM 빌드 성공
- Vite 빌드 성공
- 웹 브라우저 렌더링 정상 확인
