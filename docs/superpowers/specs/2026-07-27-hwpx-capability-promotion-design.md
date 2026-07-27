# HWPX 잔여 구조 기능 승격 설계

- 작성일: 2026-07-27
- 상태: 승인됨
- 범위: `table.insertCaption`, `setRunStyle`, `setDocumentMetadata`,
  `setHeaderFooter`, `insertFootnote`

## 1. 목적

현재 HWPX catalog의 32개 canonical command 중 unavailable인 5개를 실제
source-built RHWP runtime, 저장, 재열기와 렌더 검증을 통과한 available
기능으로 승격한다. 명령 이름만 열거나 성공 응답만 반환하는 구현은 허용하지
않는다.

## 2. 채택한 접근법

### 비교한 접근법

1. HWPX ZIP XML을 Node에서 명령별로 직접 조작
   - 빠르지만 HWPX schema·관계·ID 관리가 이중 구현되므로 기본안으로
     채택하지 않는다.
2. published `@rhwp/core`가 갱신될 때까지 unavailable 유지
   - 제품 목표를 달성하지 못하므로 채택하지 않는다.
3. vendored RHWP source를 canonical runtime으로 빌드하고 parser/model/
   serializer의 손실 원인을 수정
   - 근본 원인을 한 엔진에서 해결하고 Studio와 API가 같은 runtime을
     사용하므로 채택한다.

Node package overlay는 source serializer가 보존할 수 없는 opaque entry를
원본에서 복구하는 현재 preserve-package 정책에만 사용한다. 새 caption,
run style, metadata, header/footer, footnote 구조를 Node에서 별도로 발명하지
않는다.

## 3. source-built runtime

`editor_hwpx/src`에서 WASM package를 재현 가능하게 빌드하고 다음 세 위치를
같은 artifact hash로 materialize한다.

```text
editor_hwpx/pkg/
editor_hwpx/node_modules/@rhwp/core/
editor_hwpx/rhwp-studio/node_modules/@rhwp/core/
```

`hwpx-runtime-readiness`는 JavaScript wrapper, TypeScript declaration과 WASM
실제 export를 모두 검사한다. 세 surface의 artifact hash와 command별 native
method 목록이 다르면 시작을 거부한다.

## 4. 명령별 저장 후조건

### `table.insertCaption`

- inspected table에 before/after caption을 하나 생성한다.
- 재열기 후 같은 table control에서 caption text와 위치가 조회되어야 한다.
- 기존 table cell, picture와 table count는 변하지 않는다.

### `setRunStyle`

- paragraph 또는 table-cell 내부의 정확한 범위에 direct character format을
  적용한다.
- bold, italic, underline, font family, font size와 color를 지원한다.
- 재열기 후 범위 양 끝과 char shape 속성이 일치해야 한다.

### `setDocumentMetadata`

- title, subject, author, keywords, description의 부분 업데이트를 지원한다.
- 지정하지 않은 필드는 보존한다.
- HWPX content manifest와 metadata XML 관계가 유효해야 한다.

### `setHeaderFooter`

- section, header/footer, both/odd/even과 left/center/right를 지원한다.
- 같은 적용 범위의 기존 항목은 명시적으로 교체하고 다른 범위는 보존한다.
- 재열기와 SVG 렌더에서 text가 확인되어야 한다.

### `insertFootnote`

- inspected text offset에 reference를 삽입하고 footnote body를 생성한다.
- reference ID와 body ID가 일치하고 중복 ID가 없어야 한다.
- 재열기 후 본문 위치와 footnote text가 모두 조회되어야 한다.

## 5. 실제 fixture와 검증

각 기능은 최소 세 종류의 fixture로 검증한다.

- source-built blank HWPX
- 11쪽 교육부 공공기관 HWPX
- 한컴오피스에서 생성·재저장한 해당 control 포함 HWPX

승격 gate:

1. adapter 단위 테스트
2. source build와 wrapper/WASM readiness
3. atomic apply 실패 시 byte/revision 불변
4. save/reopen postcondition
5. package relationship와 opaque binary identity
6. RHWP SVG nonblank render
7. 프로젝트 HWPX Studio load
8. 한컴오피스 dry-run 계약과 가능한 환경의 실제 open/resave/PDF

한컴오피스가 없는 환경에서는 `hancom=not-run`을 명시하며 기능을 완전 검수로
표현하지 않는다.

## 6. 완료 기준

- HWPX 32개 명령이 모두 `readiness=available`이다.
- runtime readiness가 32개 전체 native surface를 검증한다.
- 다섯 기능의 REST와 MCP output hash가 동일하다.
- 교육부 11쪽 fixture의 page/table/picture/image/opaque entry 불변식이
  유지된다.
- Studio와 API가 같은 source-built WASM hash를 사용한다.
