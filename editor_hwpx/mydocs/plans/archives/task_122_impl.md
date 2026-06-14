# 타스크 122 구현 계획서 (수정판) — 문단 개요 번호/글머리표 렌더링 완성

## 전체 구현 단계 (7단계)

**1~3단계**: 완료 (Bullet 파싱/렌더링, Outline match 분기)
**4~7단계**: 추가 (로컬 빌드, 진단 도구, 구역 개요번호, 통합 검증)

---

## 1단계: 개요 문단(Outline) match 분기 수정 ✅ 완료

layout.rs의 match 분기에서 Outline을 Number와 동일 경로로 처리.
※ numbering_id=0인 경우 early return되어 실제 렌더링은 6단계에서 완성

---

## 2단계: 글머리표(Bullet) 파싱 및 데이터 모델 ✅ 완료

Bullet struct, parse_bullet(), serialize_bullet(), ResolvedStyleSet.bullets 추가.

---

## 3단계: 글머리표(Bullet) 렌더링 ✅ 완료

layout.rs에서 Bullet 분기 → bullet_char 삽입 렌더링.

---

## 4단계: 로컬 빌드 환경 설정

### 목표
Docker 없이 로컬에서 네이티브 빌드/테스트 가능하도록 환경을 확인 및 문서화한다. (WASM만 Docker 사용)

### 작업 내용
- `cargo build` / `cargo test` 로컬 실행 가능 여부 확인
- 필요한 시스템 의존성 확인 (openssl, pkg-config 등)
- CLAUDE.md 빌드 섹션에 로컬 빌드 명령 추가

---

## 5단계: 진단(diagnostic) 명령어 체계화

### 목표
임시 `eprintln` 대신, `rhwp diag <파일.hwp>` 명령으로 문서 구조 진단 정보를 출력한다.

### 출력 내용
```
=== DocInfo 요약 ===
  Numbering: 3개 (형식: ["^1.", "^2.", ...])
  Bullet: 2개 (문자: ●, ■)

=== ParaShape head_type 분포 ===
  None: 15개, Outline: 8개, Number: 3개, Bullet: 2개

=== SectionDef 개요번호 ===
  구역0: outline_numbering_id=1 → Numbering[0]

=== 비None head_type 문단 ===
  구역0:문단5 head=Outline level=0 num_id=0 text="웹한글기안기..."
  구역0:문단7 head=Bullet  level=3 num_id=1 text="기존 한글 문서의..."
```

### 변경 파일
- src/main.rs: `diag` 서브커맨드 추가

---

## 6단계: SectionDef 개요번호 파싱 및 Outline 렌더링 완성

### 목표
SectionDef의 numbering_id(바이트 14-15)를 저장하고, Outline 문단 렌더링 시 이를 참조한다.

### 핵심 발견
- SectionDef 바이트 14-15에 `numbering_id`가 있으나, 현재 `_numbering_id`로 버림
- 개요 문단은 ParaShape.numbering_id=0이고, 구역의 numbering_id로 Numbering 참조

### 변경 파일 및 내용

**src/model/document.rs**
- SectionDef에 `outline_numbering_id: u16` 필드 추가

**src/parser/body_text.rs** (라인 429)
```
// 변경 전
let _numbering_id = r.read_u16().unwrap_or(0);

// 변경 후
sd.outline_numbering_id = r.read_u16().unwrap_or(0);
```

**src/serializer/body_text.rs**
- SectionDef 직렬화에서 outline_numbering_id 출력

**src/renderer/layout.rs**
- Outline 문단에서 numbering_id=0이면 현재 구역의 outline_numbering_id 사용
- LayoutEngine에 현재 section_index 전달 또는 section별 outline_numbering_id 참조
- `apply_paragraph_numbering()`에 section-level numbering 참조 로직 추가

### 검증
- hancom-webgian.hwp SVG export에서 개요 번호 렌더링 확인
- `rhwp diag` 명령으로 outline_numbering_id 출력 확인

---

## 7단계: 통합 테스트 및 검증

### 검증 항목

| 항목 | 방법 |
|------|------|
| 기존 571개 테스트 회귀 | `cargo test` (로컬) |
| WASM 빌드 | `docker compose run --rm wasm` |
| Outline 렌더링 | hancom-webgian.hwp SVG export |
| Bullet 렌더링 | hancom-webgian.hwp SVG export (Bullet 문단 포함) |
| Number 기존 동작 유지 | 기존 샘플 파일 SVG export 비교 |
| diag 명령 출력 | `rhwp diag samples/hancom-webgian.hwp` |
| 직렬화 라운드트립 | Bullet/SectionDef 파싱 → 저장 → 재파싱 |

---

## 영향 범위 요약

| 파일 | 단계 | 변경 내용 |
|------|------|-----------|
| src/renderer/layout.rs | 1, 3, 6 | Outline/Bullet 렌더링 로직 (핵심) |
| src/model/style.rs | 2 | Bullet struct 추가 |
| src/model/document.rs | 2, 6 | bullets 필드, SectionDef.outline_numbering_id |
| src/parser/doc_info.rs | 2 | parse_bullet() + HWPTAG_BULLET |
| src/parser/body_text.rs | 6 | SectionDef numbering_id 저장 |
| src/serializer/doc_info.rs | 2 | serialize_bullet() |
| src/serializer/body_text.rs | 6 | SectionDef numbering_id 직렬화 |
| src/renderer/style_resolver.rs | 2 | ResolvedStyleSet에 bullets 추가 |
| src/main.rs | 5 | diag 서브커맨드 추가 |
| CLAUDE.md | 4 | 로컬 빌드 명령 문서화 |
