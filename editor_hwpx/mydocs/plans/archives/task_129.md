# 타스크 129 수행계획서 — 폰트 치환 체인 완전성 검증

## 배경

### 현재 구조

폰트 치환은 3계층으로 동작한다:

```
Rust style_resolver.rs (HFT→TTF 치환, 72개 입력 → 17개 출력)
  → TypeScript font-substitution.ts (7개 언어별 테이블, 143개 항목, 다중 홉 체인)
    → CSS generic fallback (serif/sans-serif)
```

### 점검 결과 — 발견된 문제점

#### 문제 1: 끊어진 체인 (CRITICAL) — 3건

TypeScript 치환이 font-loader.ts에 **미등록된 폰트**로 해석되는 경우:

| 원본 폰트 | 치환 결과 | 문제 |
|-----------|----------|------|
| `Gulimche` | `Haansoft Dotum` | font-loader에 미등록 |
| `가는안상수체` | `안상수2006가는` | font-loader에 미등록 |
| `굵은안상수체` | `안상수2006굵은` | font-loader에 미등록 |

브라우저가 해당 폰트를 찾지 못해 시스템 기본 폰트로 렌더링된다.

#### 문제 2: Generic fallback 불일치 (LOW)

| 키워드 | Rust `generic_fallback()` | TS `fontFamilyWithFallback()` |
|--------|--------------------------|-------------------------------|
| palatino | serif | **sans-serif** (미감지) |
| georgia | serif | **sans-serif** (미감지) |
| batang (로마자) | serif | **sans-serif** (미감지) |
| gungsuh (로마자) | serif | **sans-serif** (미감지) |

Rust는 `palatino`, `georgia`, `batang`, `gungsuh` 키워드를 serif로 분류하지만, TypeScript의 정규식 `/[바탕명조궁서]|hymjre|Times/i`에는 이 패턴이 없다.

## 구현 단계 (3단계)

---

### 1단계: 끊어진 체인 수정

**파일**: `rhwp-studio/src/core/font-substitution.ts`

3건의 끊어진 치환을 등록된 폰트로 연결한다:

| 원본 | 현재 치환 | 수정 후 |
|------|----------|---------|
| `Gulimche` | `Haansoft Dotum` | `굴림체` (font-loader에 등록됨) |
| `가는안상수체` | `안상수2006가는` | `함초롬돋움` (산세리프 폴백) |
| `굵은안상수체` | `안상수2006굵은` | `함초롬돋움` (산세리프 폴백) |

`중간안상수체` → `안상수2006중간`도 동일하게 미등록이므로 함께 수정.

---

### 2단계: Generic fallback 정규식 보완

**파일**: `rhwp-studio/src/core/font-substitution.ts`

`fontFamilyWithFallback()`의 serif 감지 정규식을 Rust `generic_fallback()`과 일치시킨다:

```typescript
// [현재]
const isSerif = /[바탕명조궁서]|hymjre|Times/i.test(fontName);

// [변경]
const isSerif = /[바탕명조궁서]|hymjre|times|palatino|georgia|batang|gungsuh/i.test(fontName);
```

---

### 3단계: 통합 테스트 및 검증

| 항목 | 방법 |
|------|------|
| 571개 회귀 테스트 | `docker compose run --rm test` |
| WASM 빌드 | `docker compose run --rm wasm` |
| TypeScript 타입 체크 | `npx tsc --noEmit` |
| Gulimche 체인 | resolveFont('Gulimche', 6) → 최종 등록 폰트 확인 |
| 안상수체 체인 | resolveFont('가는안상수체', 0) → 함초롬돋움 확인 |
| Palatino fallback | fontFamilyWithFallback('Palatino Linotype') → serif 확인 |

---

## 변경 파일 요약

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `rhwp-studio/src/core/font-substitution.ts` | 끊어진 체인 4건 수정 + serif 정규식 보완 | ~5줄 |

## 기대 효과

| 항목 | 현재 | 적용 후 |
|------|------|---------|
| Gulimche 렌더링 | 시스템 기본 폰트 | 굴림체 (hamchod-r.woff2) |
| 안상수체 렌더링 | 시스템 기본 폰트 | 함초롬돋움 (hamchod-r.woff2) |
| Palatino/Georgia fallback | sans-serif (오분류) | serif (Rust와 일치) |
| 변경 규모 | — | 1개 파일, ~5줄 |
