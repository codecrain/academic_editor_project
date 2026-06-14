# 타스크 32 - 4단계 완료 보고서

## 단계: 툴바 UI (HTML/CSS)

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `web/editor.html` | `#format-toolbar` div 추가 (기존 #toolbar 아래, main 위) |
| `web/editor.css` | 서식 툴바 전체 스타일링 (100줄+) |

## 툴바 구성

| 그룹 | 요소 | ID |
|------|------|-----|
| 글꼴 | select (12개 폰트) | `fmt-font` |
| 글자 크기 | - 버튼 + input + + 버튼 | `fmt-size-down`, `fmt-size`, `fmt-size-up` |
| 글자 서식 | B / I / U / S 토글 버튼 | `fmt-bold`, `fmt-italic`, `fmt-underline`, `fmt-strike` |
| 색상 | 글자색 + 강조색 (color picker 연동) | `fmt-text-color`, `fmt-shade-color` |
| 정렬 | 양쪽/왼쪽/가운데/오른쪽 토글 | `fmt-align-*` |
| 줄간격 | select (100~300%) | `fmt-line-spacing` |
| 들여쓰기 | 내어쓰기/들여쓰기 버튼 | `fmt-indent-dec`, `fmt-indent-inc` |

## CSS 설계

- `.fmt-group`: 그룹 구분 (세로선 구분)
- `.fmt-btn.fmt-toggle.active`: 활성 상태 (녹색 배경)
- `.fmt-color-bar`: 색상 표시기 (버튼 하단 3px 바)
- `.fmt-color-picker`: 숨겨진 color input (버튼 클릭 시 연동)
- 기존 `#toolbar`와 일관된 디자인 언어

## 특이사항

- `#format-toolbar.hidden`으로 초기 상태 숨김 (문서 로드 후 표시)
- Unicode 문자로 아이콘 대체 (외부 리소스 불필요)
- 반응형: `overflow-x: auto`로 좁은 화면에서 스크롤 가능

## 테스트 결과
- Rust 빌드 성공 (HTML/CSS는 빌드에 영향 없음)
- 399개 테스트 유지
