# HWPX 편집 한계 개선 및 실제 호출 레드팀 결과 (2026-08-12)

## 결론

이번 보완은 새 MCP 도구를 늘리지 않고 기존 9개 수명주기 도구와 41개 명령을 유지했다. 대신 `inspect`, `review`, `save`, 기존 이미지 명령의 증거와 게이트를 강화했다. 계약·카탈로그·서버·Codex skill은 모두 `2.2.0`으로 맞췄다.

이전 B 결과를 통과시켰던 핵심 결함은 “패키지가 열리고 표 셀이 잘리지 않으면 품질 통과”에 가까운 구조 검증이었다. 현재 `submission` 프로필은 미완성 내용과 위험한 배치를 오류로 승격하며, 같은 프로필의 clean review 없이는 verified save나 PDF export를 허용하지 않는다.

## 설계 및 구현

### 1. 파편화 없는 의미·제출 검증

- 새 MCP 도구를 추가하지 않고 `editor_hwpx_review(profile="structural|submission")`와 `editor_hwpx_inspect(view="quality")`에 공통 의미 분석기를 연결했다.
- `submission`은 미해결 placeholder, 더미 식별자, 명시적 필수 위치 공백, 작성자 지시문 잔존, paper/page 고정 floating image를 차단한다.
- 날짜·서명 미완료와 낮은 페이지 점유율은 추측으로 문서를 고치지 않고 검토 증거로 반환한다.
- `allowedUnresolvedLocations`로 합법적 예외를 명시할 수 있어 휴리스틱을 전역 면제 규칙으로 키우지 않는다.

### 2. 보호영역/양식 의도 명시화

- `templatePolicy`에 위치 역할(`requiredLocations`, `instructionLocations`, `freeformLocations`, `allowedUnresolvedLocations`)과 표 역할(`repeatableTableIds`, `conditionalTableIds`)을 추가했다.
- `inspect(view="template")`은 `instruction`, `conditional`, `fillable-unresolved` 후보와 근거·신뢰도를 반환하지만, 제안은 절대로 자동 보호 규칙이 되지 않는다.
- 동일 위치/표를 모순된 역할로 지정하면 `template_policy_conflict`로 mutation 전에 거부한다.
- 결과적으로 모든 표를 보존하는 강한 암묵 제약 대신, 호출자가 측정 후 역할을 명시하고 미분류 손실은 review에서 드러내는 모델로 정리했다.

### 3. 문서 전체 페이지/렌더 상태 관측

- `inspect(view="page")`는 앞 120개 target만 보는 대신 전체 outline cursor를 끝까지 순회한 뒤 요청 페이지 target을 제한해 반환한다.
- `targetCoverage`에 전체 스캔 수, 페이지 일치 수, 반환 수, 절단 여부를 제공한다.
- SVG 증거에 페이지 크기, 글자/행/이미지/도형 수, 최소·최대 글꼴, content box, vertical occupancy를 공통으로 계산한다.
- review는 모든 페이지를 한 번 렌더하고 이 증거를 재사용해 불필요한 중복 렌더 프로세스를 만들지 않는다.

### 4. 검토 프로필과 저장 권한 연결

- current revision의 clean review뿐 아니라 `qualityProfile`도 precondition에 기록한다.
- `profile="submission"` verified save/export에는 동일 revision의 clean submission review가 필요하다.
- structural review 뒤 submission save, submission review 뒤 structural save를 모두 `quality_profile_required`로 거부한다.
- 수정 또는 template policy 변경 시 review 권한은 즉시 무효화된다.

### 5. 이미지 삽입의 실제 native read-back

- `image.insertAfterParagraph`는 안전한 inline 배치를 요청하고, 삽입 직후 native `getPictureProperties`로 재조회한다.
- `treatAsChar=true`가 실제 유지되지 않으면 `HWPX_IMAGE_PLACEMENT_VERIFICATION_FAILED`로 원자 배치를 실패시킨다.
- Native HWP는 inline일 때도 비활성 `Paper`/`Square` 필드를 보존할 수 있으므로, 문서·카탈로그는 이를 실제 동작에 맞게 설명한다. 의도적 floating은 기존 `object.format`으로 분리한다.

## 실제 B 문서 재현 결과

입력: `B_작성완료본_20260812.hwp`, SHA-256 `72e5a3de82e36e595b5f9775882a1d003c12084761046678f7604e02b4d646fe`

- 구조: 25쪽, 본문 문단 220, 표 44, 셀 986, 그림 3.
- template 제안: conditional 11, instruction 14, fillable-unresolved 33.
- submission 오류 증거: 작성 지시문 14, 미해결 placeholder 33, 미완료 날짜/서명 3, 더미 식별자 target 2, 위험 floating image 3.
- 낮은 점유율: 14쪽 5.08%, 20쪽 5.42%, 22쪽 1.48%.
- 페이지 target 전체성: 문서 target 1,162개를 끝까지 스캔했다. 1쪽 99개, 14쪽 1개, 22쪽 1개, 25쪽 51개가 일치했고 네 호출 모두 `truncated=false`였다.
- 세 그림 모두 기존 상태가 `treatAsChar=false`, `Paper/Paper`, offset 0, `Square`였고 submission review가 모두 차단했다.
- structural review는 진단을 반환하되 통과했고, 그 결과로 submission 저장을 시도하자 `quality_profile_required`로 차단했다. 이어 submission review 자체는 `ok=false`였다.

## 레드팀 검증

### 실제 11004 MCP/브라우저

- live inventory: catalog `2.2.0` = contract `2.2.0` = server `2.2.0`, 9 tools, 41 commands, issues 0.
- 실제 B open → Browser URL 표시 → template/objects/page 1·14·22·25 → structural review → profile 우회 저장 거부 → submission review 실패 → discard를 수행했다.
- 별도 native HWP에서 target/objects 선행 검사 → PNG 삽입 → native object 재조회 → submission review → 반대 프로필 저장 거부 → 동일 프로필 review → verified save → reopen/render → artifact read/local SHA-256 비교 → artifact delete를 수행했다.
- native HWP 저장은 source format `hwp`, revision 2, reopen page 1, rendered page 1, clipped cell 0을 유지했고 서버 SHA-256과 로컬 SHA-256이 일치했다.

### 자동화 검증

- `npm.cmd run test:hwpx-api`: 241/241 통과.
- `npm.cmd run test:runtime`: 438/438 통과.
- gateway/MCP/semantic/SVG 집중 검증: 43/43 통과.
- native image read-back 집중 검증: 37/37 통과.
- 검증 범위에는 stale revision, exact-target precondition, object inventory, 원자 rollback, template 보호/충돌, text-loss 승인, 페이지 부재, 의미 프로필, 프로필 우회, HWP 형식 보존, 실제 read-back, save/reopen/hash/artifact cleanup이 포함된다.

## 증거 위치

- 서버 수명주기 추적: `.run/hwpx-semantic-red-team-20260812/gateway-trace.jsonl`
- 실제 B 전체 응답: `.run/hwpx-semantic-red-team-20260812/live-b-results.json`
- 실제 B 요약: `.run/hwpx-semantic-red-team-20260812/live-b-summary.log`
- 실제 B Browser 캡처: `.run/hwpx-semantic-red-team-20260812/b-live-browser.png`
- native HWP 이미지/저장 전체 응답: `.run/hwpx-semantic-red-team-20260812/live-hwp-image-save-results.json`
- native HWP 실제 재호출 요약: `.run/hwpx-semantic-red-team-20260812/live-hwp-image-save-readback-summary.log`
- live inventory: `.run/hwpx-semantic-red-team-20260812/inventory-live-2.2.log`
- HWPX suite: `.run/hwpx-semantic-red-team-20260812/test-hwpx-api-final.log`
- runtime suite: `.run/hwpx-semantic-red-team-20260812/test-runtime-final.log`
- gateway 집중 suite: `.run/hwpx-semantic-red-team-20260812/gateway-contract-final.log`

## 남아 있는 의도적 경계

- template 후보는 증거이며 자동 정책이 아니다. 문서 의미를 추측해 표를 삭제하거나 보호하는 것은 데이터 손실 위험 때문에 명시 정책으로 남겼다.
- `submission`은 완성도 문제를 탐지하는 게이트이지 내용 자체의 사실성·사업 타당성을 대신 평가하지 않는다.
- low occupancy는 잘못된 page break의 강한 단서지만 표지·간지일 수 있으므로 경고로 유지한다.
- native HWP inline 이미지의 dormant floating 필드는 제거를 보장하지 않는다. 실제 흐름 안전성은 `treatAsChar` read-back과 full render/save-reopen으로 검증한다.
