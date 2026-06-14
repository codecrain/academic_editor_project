# 타스크 116 수행계획서

## 과제명
맑은 고딕이 함초롬돋움으로 매핑되는 버그 수정

## 배경

폰트 치환 테이블(`SUBST_TABLES`)에 `['맑은 고딕',1,'함초롬돋움',1]` 규칙이
7개 언어 테이블 모두에 존재한다. 그러나 "맑은 고딕"은 `font-loader.ts`에서
웹폰트(`MalgunGothicW35-Regular.woff2`)로 이미 등록되어 있으므로,
치환 없이 그대로 사용해야 한다.

## 버그 원인

```
"맑은 고딕" (문서에 지정된 폰트)
  ↓ resolveFont() 호출
  ↓ SUBST_TABLES에서 매칭: ['맑은 고딕',1,'함초롬돋움',1]
  ↓ 치환 적용
"함초롬돋움" ← 산세리프(고딕)가 세리프(돋움)로 바뀜!
```

`resolveFont()` 함수는 치환 체인을 따라가면서 `REGISTERED_FONTS`에 있는지 확인하는데,
"맑은 고딕"이 치환 테이블에 소스로 등록되어 있어 체인이 시작되어 버린다.

## 수정 대상

| 파일 | 수정 내용 | 수정 줄 수 |
|------|-----------|-----------|
| `rhwp-studio/src/core/font-substitution.ts` | 7개 언어 테이블에서 `['맑은 고딕',1,'함초롬돋움',1]` 규칙 삭제 | 7줄 삭제 |
| `web/font_substitution.js` | 동일하게 7개 언어 테이블에서 해당 규칙 삭제 | 7줄 삭제 |

총 14줄 삭제.

## 구현 계획 (3단계)

### 1단계: 치환 규칙 삭제

두 파일에서 `['맑은 고딕',1,'함초롬돋움',1]` 규칙을 모두 삭제한다.

### 2단계: 빌드 검증

- Docker 네이티브 빌드
- WASM 빌드
- rhwp-studio TypeScript 컴파일 확인

### 3단계: 최종 보고서 + 오늘할일 갱신

## 핵심 참조 파일

| 파일 | 참조 이유 |
|------|----------|
| `rhwp-studio/src/core/font-substitution.ts` | TypeScript 폰트 치환 테이블 |
| `web/font_substitution.js` | JavaScript 폰트 치환 테이블 (웹 데모용) |
| `rhwp-studio/src/core/font-loader.ts` | 웹폰트 등록 목록 ("맑은 고딕" 등록 확인) |
| `rhwp-studio/src/core/wasm-bridge.ts` | resolveFont() 호출 지점 |

## 리스크

| 리스크 | 대응 |
|--------|------|
| 다른 폰트도 유사한 문제가 있을 수 있음 | 등록된 웹폰트 목록과 치환 테이블을 대조하여 추가 충돌 여부 확인 |
