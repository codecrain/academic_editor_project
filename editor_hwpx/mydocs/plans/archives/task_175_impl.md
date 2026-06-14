# 타스크 175 구현 계획서: 환경설정 대화상자 + 대표글꼴

## 구현 단계 (4단계)

### 1단계: UserSettings 서비스 + 도구 메뉴

**목표**: 확장 가능한 설정 저장/로드 인프라 구축 + 도구 메뉴 추가

**작업 내용**:
1. `rhwp-studio/src/core/user-settings.ts` 생성
   - `UserSettings` 클래스 (싱글턴)
   - localStorage 기반 저장/로드 (`rhwp-settings` 키)
   - `get<T>(path: string): T`, `set(path: string, value: any)`, `save()`, `load()`
   - 버전 관리 (`version: 1`) + 기본값 병합
   - 기본 대표 글꼴 프리셋 4종 내장 (함초롬/돋움/맑은 고딕/바탕)
   - FontSet 타입 정의 (name + 7개 언어 글꼴)

2. `index.html`에 "도구" 메뉴 추가
   - 메뉴 아이템: "환경 설정" (`data-cmd="tool:options"`)

3. `rhwp-studio/src/command/commands/tool.ts` 생성
   - `tool:options` 커맨드 등록

**산출물**: UserSettings API + 도구 메뉴 UI

---

### 2단계: 환경설정 대화상자 (글꼴 탭)

**목표**: OptionsDialog 구현 (탭 구조, 글꼴 탭 콘텐츠)

**작업 내용**:
1. `rhwp-studio/src/ui/options-dialog.ts` 생성
   - ModalDialog 상속, 탭 구조 (글꼴 탭 1개, 향후 확장 가능)
   - 글꼴 탭 내용:
     - "최근에 사용한 글꼴 보이기" 체크박스 + 개수 (1~5)
     - "대표 글꼴 등록" 섹션 + [대표 글꼴 등록하기] 버튼
   - 확인/취소 시 UserSettings에 저장

2. `rhwp-studio/src/styles/options-dialog.css` 생성
   - `opt-` 접두어 CSS

3. `tool:options` 커맨드에서 OptionsDialog 호출 연결

**산출물**: 환경설정 대화상자 (글꼴 탭)

---

### 3단계: 대표 글꼴 등록/편집/삭제 대화상자

**목표**: FontSetDialog + FontSetEditDialog 구현

**작업 내용**:
1. `rhwp-studio/src/ui/font-set-dialog.ts` 생성
   - 대표 글꼴 목록 (내장 프리셋 + 사용자 정의)
   - 추가/편집/삭제 아이콘 버튼
   - 내장 프리셋은 편집/삭제 불가 (읽기 전용 표시)
   - 사용자 정의 세트만 편집/삭제 가능

2. `rhwp-studio/src/ui/font-set-edit-dialog.ts` 생성
   - 대표 글꼴 이름 입력
   - 7개 언어별 글꼴 드롭다운 (한글/영문/한자/일어/외국어/기호/사용자)
   - 글꼴 목록: font-loader.ts의 등록 글꼴 기반
   - 추가/편집 모드 분기

3. `rhwp-studio/src/styles/font-set-dialog.css` 생성
   - `fs-`, `fse-` 접두어 CSS

4. UserSettings에 CRUD 연동

**산출물**: 대표 글꼴 등록/편집/삭제 기능

---

### 4단계: 서식바 연동 + 검증

**목표**: 대표 글꼴을 서식바 글꼴 드롭다운에 반영 + 최종 검증

**작업 내용**:
1. 서식바 글꼴 드롭다운 동적 생성
   - 기존 하드코딩 옵션 → UserSettings의 대표 글꼴 + 기본 글꼴 목록으로 동적 구성
   - "── 대표 글꼴 ──" 구분선 + 대표 글꼴 세트 목록
   - 대표 글꼴 선택 시 7개 언어 일괄 적용 (wasm-bridge 연동)

2. 대표 글꼴 선택 시 CharFormat 일괄 적용 로직
   - 선택된 대표 글꼴의 7개 언어별 글꼴을 각각 적용

3. cargo test + WASM 빌드 검증

**산출물**: 서식바 대표 글꼴 연동 + 최종 검증 완료
