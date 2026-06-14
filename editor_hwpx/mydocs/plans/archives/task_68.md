# 타스크 68: 비동기 웹폰트 2단계 로딩 완료 후 자동 리렌더링 트리거

## 배경

타스크 64에서 웹폰트 2단계 로딩을 구현했다:
- **1단계(동기)**: 핵심 폰트(함초롬바탕/돋움) `await` 로드
- **2단계(비동기)**: 나머지 86개 폰트 `fire-and-forget`으로 백그라운드 로드

## 문제

2단계 폰트 로딩이 완료되기 전에 HWP 문서를 열면:
1. `measureTextWidth()`가 미로드 폰트에 대해 브라우저 기본 fallback 메트릭을 사용
2. 글자 폭이 실제 폰트와 달라져 글자 겹침/간격 불일치 발생
3. 이후 폰트가 로드되어도 **자동 리렌더링이 없어** 틀린 레이아웃이 유지됨

## 해결 방향

`loadWebFonts()`가 2단계 완료 Promise를 반환하도록 수정하고,
`main.ts`에서 해당 Promise 완료 시 보이는 페이지를 자동 리렌더링한다.

## 수정 범위

| 파일 | 작업 | 규모 |
|------|------|------|
| `rhwp-studio/src/core/font-loader.ts` | `loadWebFonts()` 반환 타입에 background Promise 포함 | ~5줄 |
| `rhwp-studio/src/main.ts` | background Promise 완료 시 `refreshPages()` 호출 | ~8줄 |

## 검증

- Vite 빌드 성공
- 문서 로드 직후 2단계 폰트 로딩 완료 시 자동 리렌더링 로그 확인
