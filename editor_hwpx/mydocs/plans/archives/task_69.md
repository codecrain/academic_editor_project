# 타스크 69 수행 계획서: 용지설정 윗여백·머릿말 높이 보정

## 배경

한컴 도움말(hwpkor.chm)의 용지 여백 설명:
> "머리말과 꼬리말 여백은 내용 유무와 상관없이, [편집 용지-머리말/꼬리말 여백]에서 지정해 놓은 높이만큼 공간을 띄우고 본문을 시작합니다."

## 문제

현재 `PageAreas::from_page_def()`에서 **본문 시작 = margin_top**으로 계산하고 있으나,
한컴 HWP 실제 동작은 **본문 시작 = margin_top + margin_header**이다.

### 예시 (hwp-multi-001.hwp)

| 항목 | 현재 구현 | 한컴 실제 동작 |
|------|-----------|---------------|
| margin_top | 15mm | 15mm |
| margin_header | 10mm | 10mm |
| **본문 시작** | **15mm** (56.7px) | **25mm** (94.5px) |
| **차이** | - | **10mm (37.8px) 아래** |

### HWP 여백 구조 (한컴 기준)

```
용지 상단 (0)
├── margin_header (10mm)     ← 머리말 시작 위치
├── margin_header 구간       ← 머리말 내용 영역
├── margin_top 구간 (15mm)   ← 머리말 높이
├── 본문 시작 (25mm)         ← margin_top + margin_header
│   ...본문...
├── 본문 끝                  ← height - margin_bottom - margin_footer
├── margin_bottom 구간       ← 꼬리말 높이
├── margin_footer 구간       ← 꼬리말 끝
└── 용지 하단
```

## 수정 범위

핵심 수정: `src/model/page.rs`의 `PageAreas::from_page_def()` 1곳

| 파일 | 작업 |
|------|------|
| `src/model/page.rs` | 본문 영역 top/bottom 계산 수정 |

## 검증

1. 488개 Rust 테스트 통과
2. SVG 내보내기로 본문 시작 y좌표 확인 (hwp-multi-001.hwp)
3. 여러 샘플 문서 렌더링 회귀 확인
