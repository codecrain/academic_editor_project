# 실제 질문·첨부 기반 DOCX/HWPX 평가 설계

- 작성일: 2026-07-27
- 상태: 승인됨
- 모델: `gpt-5.4-nano`
- 호출 수: 문항당 1회, 총 100회, 자동 재시도 0회

## 1. 목적

현재 평가가 attachment hash를 확인한 뒤 gold의 `commandTemplates`를 직접
실행하는 문제를 제거한다. 평가 대상 agent는 실제 질문과 실제 첨부에서
추출한 근거만 받고, 어떤 문서를 어떻게 수정할지 스스로 계획한다. Gold는
모델 호출과 실행 경로에서 숨기고 최종 채점에만 사용한다.

## 2. 채택한 접근법

### 비교한 접근법

1. 모델만 사용
   - 실제 질문 해석은 가능하지만 파일 보존·정확한 target·재현성을 보장하기
     어려워 단독으로 채택하지 않는다.
2. 결정론적 규칙 planner만 사용
   - 재현 가능하지만 생성기 문구에 과적합되어 실제 agent 평가가 아니므로
     단독으로 채택하지 않는다.
3. 모델 planner + 결정론적 extractor/executor/oracle
   - 질문 해석은 모델이 담당하고 증거 추출·API 안전성·채점은 결정론적으로
     유지할 수 있어 채택한다.

## 3. attachment extraction

각 attachment는 원본 hash를 검증한 뒤 다음 extractor로 bounded evidence를
만든다.

| 형식 | 추출 내용 |
| --- | --- |
| HWPX | 문단·표·개체 inventory, metadata, page/section 구조 |
| HWP | RHWP native JSON/text projection, control inventory |
| DOCX | OOXML 문단·표·header/footer·metadata·media inventory |
| XLSX | sheet명, used range, 수식과 계산값, 날짜·단위 |
| CSV/TXT | encoding 검증, header와 bounded rows/lines |
| PDF | 페이지별 text와 page count, 이미지-only 여부 |
| PNG/JPG | 크기·MIME·OCR text와 perceptual hash |

Evidence item은 `attachmentId`, `locator`, `value`, `unit`, `asOf`,
`extractionMethod`, `sourceHash`를 포함한다. 질문의 모든 참조 attachment가
evidence bundle에 없으면 모델을 호출하지 않고 실패한다.

## 4. 모델 입력과 출력

모델에는 다음만 제공한다.

- 원문 질문
- attachment registry와 bounded evidence
- 현재 target document의 bounded read/target map/object inventory
- 해당 형식의 machine-readable command catalog
- JSON output schema

제공하지 않는 항목:

- scenario의 `oracle`
- gold file
- expected target text
- command template
- score와 hard-failure 정답

모델 출력:

```json
{
  "evidenceCitations": [
    {"attachmentId": "source-id", "locator": "Sheet1!B4"}
  ],
  "conflicts": [],
  "commands": [],
  "verificationPages": [1],
  "summary": "..."
}
```

모델 호출은 `gpt-5.4-nano` 100회로 고정한다. 자동 retry, fallback model,
동일 문항 재질문을 금지한다. timeout·schema 오류·근거 없는 값은 해당 문항
실패로 기록한다.

## 5. 실제 REST/MCP 실행

각 문항은 모델이 생성한 동일 command plan을 다음 순서로 두 번 실행한다.

1. REST open/read/catalog/inspect/inventory/apply/quality/render/save/read/delete
2. MCP open/read/catalog/inspect/inventory/apply/quality/render/save/read/delete

두 output은 exact visible text, package inventory와 SHA-256이 동일해야 한다.
실패한 batch는 revision과 bytes가 변하지 않아야 한다.

## 6. 데이터셋 다양성

100문항은 편집 90·생성 10을 유지하되 다음 하한을 강제한다.

- attachment 조합 25종 이상
- command operation 조합 15종 이상
- 질문 template family 20종 이상
- 각 문항 HWPX/DOCX target 1개와 추가 형식 3개 이상
- 각 문항 source fact 4개 이상
- 100~1,000자 질문
- 공공기관 업무 영역 10개 이상
- 개인정보, 날짜 충돌, 단위 오류, 수식 오류 중 2개 이상

DOCX와 HWPX 결과를 비교하는 문항을 최소 20개 포함하고, 10개 생성 문항은
빈 파일에 text만 append하는 방식이 아니라 표·스타일·쪽 설정·이미지 중
세 종류 이상을 생성한다.

## 7. 채점

점수는 두 층으로 분리한다.

- `agentScore`: 근거 선택, 충돌 처리, 명령 계획과 질문 충족도
- `artifactScore`: content, layout, style, object, package, reopen, API parity

hard failure:

- gold가 모델 입력에 노출됨
- source에 없는 사실 생성
- 개인정보 유출
- partial commit
- unrequested object/binary loss
- 저장 파일 재열기 실패
- REST/MCP 의미 불일치

100점은 두 점수가 모두 threshold를 통과할 때만 부여한다.

## 8. 완료 기준

- runner가 `oracle.commandTemplates`를 실행 경로에서 읽지 않는다.
- extractor가 실제 파일 내용을 변경하면 evidence와 모델 결과가 달라지는
  mutation test가 존재한다.
- 100개 모델 request/response ID와 token usage가 비밀정보 없이 기록된다.
- 100건 전체에서 실제 원본 첨부, 질문, 모델 plan과 REST/MCP trace를 서로
  연결할 수 있다.
- 실패 문항은 원인별로 재현 가능한 bounded evidence를 남긴다.
