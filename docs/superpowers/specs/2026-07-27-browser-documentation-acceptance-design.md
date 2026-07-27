# 실제 브라우저 저장과 문서 정리 검수 설계

- 작성일: 2026-07-27
- 상태: 승인됨
- 범위: DOCX/HWPX browser save/reopen, 비차단 오류 UI, 현재 문서 체계

## 1. 목적

DOCX와 HWPX를 실제 브라우저에서 열고 편집하는 데서 끝나지 않고 저장된
파일을 다시 여는 것까지 자동 검수한다. 오래된 설계·계획이 현재 계약처럼
검색되는 문제를 제거하고, 코드·REST·MCP·브라우저 용어를 하나로 맞춘다.

## 2. 채택한 접근법

### 비교한 접근법

1. 단위 테스트와 headless DOM 검사만 유지
   - 빠르지만 실제 WOPI 저장, download와 재열기를 증명하지 못해 채택하지
     않는다.
2. 수동 브라우저 체크리스트만 운영
   - 실제 화면은 확인하지만 반복성과 회귀 탐지가 없어 채택하지 않는다.
3. 실제 브라우저 자동화와 제한된 시각 확인을 함께 사용
   - 저장 byte·재열기는 자동화하고 최종 화면은 실제 브라우저에서 확인할 수
     있어 채택한다.

## 3. 브라우저 저장 UX

HWPX save integrity 실패에 `window.alert()`를 사용하지 않는다. 제품 UI의
비차단 modal을 사용해 다음을 구조적으로 노출한다.

- 저장 차단 제목
- source/candidate control count 차이
- 손실된 picture/table/shape/header/footer/footnote 종류
- API/MCP preserve-package 경로 사용 안내
- 닫기 버튼과 접근 가능한 dialog role

복잡 문서의 위험한 저장은 다운로드를 시작하지 않아야 한다. 안전한 문서는
download event가 발생하고 `.hwpx` filename, ZIP signature와 nonzero bytes가
확인되어야 한다.

## 4. 실제 브라우저 시나리오

### DOCX

1. 격리된 source-built DOCX runtime과 현재 gateway 시작
2. 실제 한국어 DOCX 열기
3. 본문·표·스타일 수정
4. browser Save
5. WOPI 저장 byte 확인
6. 새 세션에서 재열기
7. 화면 text와 page count 확인

### HWPX positive

1. 안전한 generation fixture 열기
2. 본문·표·스타일 수정
3. browser Save와 download capture
4. 다운로드 HWPX를 API와 Studio에서 재열기
5. text·table·object·page count 확인

### HWPX safety

1. 4MB·11쪽 교육부 HWPX 열기
2. 실제 편집 이벤트 적용
3. save 실행
4. 손실 candidate이면 접근 가능한 저장 차단 modal 확인
5. download가 발생하지 않았음을 확인

각 시나리오는 console error, unhandled rejection와 소유 프로세스 누수를
실패로 처리한다.

## 5. 문서와 용어

현재 문서 시작점은 다음으로 제한한다.

```text
README.md
API.md
docs/DOCUMENTATION_INDEX.md
docs/HWPX_EDITOR.md
docs/HWPX_MCP_API.md
evaluation/*/README.md
```

역사적 실행 계획과 현재 사실이 충돌하는 기존 parity plan/spec는 삭제한다.
보존이 필요한 의사결정은 이 승인된 설계와 Git history로 대체한다. Vendored
upstream의 `mydocs`는 제품 계약 검색과 문서 link validator 대상에서 명시적으로
제외하고, 루트 문서 어디에서도 현재 기능 근거로 링크하지 않는다.

통일 용어:

- `documentId`: 열린 서버 문서 세션 ID
- `revision`: mutation마다 1 증가하는 문서 revision
- `artifactId`: save/PDF 후 trusted application이 읽는 opaque ID
- `save_source`: 최종 원본 형식 저장
- `save_checkpoint`: 사용자 검토용 중간 artifact
- `discard`: artifact 없이 세션 폐기
- `preserve-package`: HWPX 원본 ZIP 보존 저장 정책
- `Studio`: HWPX 브라우저 편집기
- `gateway`: 공용 REST/MCP/WOPI 서버

## 6. 문서 검수

세 번의 독립 검사를 자동화한다.

1. 링크·파일 존재·문서 index 도달성
2. prose의 command/tool count와 실행 catalog 비교
3. stale phrase와 삭제된 경로 검색

stale phrase gate에는 `250개`, `public-sector-v2`, 현재 기능을 17개로 표현하는
문구, HWPX PDF 미지원, readiness를 실행 성공으로 표현하는 문구를 포함한다.

## 7. 프로세스 정리

브라우저와 테스트가 시작한 gateway, DOCX container, preview server와 child
process의 PID/container ID를 기록한다. `finally`에서 기록된 소유 대상만
종료한다. 테스트 전부터 존재한 9980, 11004 listener와 다른 프로젝트
container는 정리 대상에 포함하지 않는다.

## 8. 완료 기준

- DOCX browser edit/save/reopen이 실제 저장 byte로 통과한다.
- 안전한 HWPX browser download/reopen이 통과한다.
- 복잡 HWPX의 위험 저장은 nonblocking modal로 차단되고 다운로드가 없다.
- 브라우저 console error와 소유 프로세스 누수가 0건이다.
- current docs의 link/catalog/stale phrase 3개 gate가 모두 통과한다.
- root working tree가 테스트 산출물 없이 clean이다.
