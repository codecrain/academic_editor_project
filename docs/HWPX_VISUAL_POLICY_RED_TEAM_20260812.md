# HWPX 시각 검수·최종화 게이트 레드팀 기록 (2026-08-12)

## 목적

HWPX 문서를 저장하기 전에 구조 검수와 렌더링 검수가 같은 기준으로 수행되었는지 확인한다. 검수에서 허용한 색상·이미지 흐름·페이지 점유율·제목 흐름·본문 스타일 정책을 저장/내보내기에서 바꿔 우회할 수 없어야 한다.

## 현재 B 기준선(삭제 전 보존)

- 원본 경로: `C:\Users\HaeyongShin\Documents\academic editor project\B_작성완료본_20260812.hwp`
- SHA-256: `72e5a3de82e36e595b5f9775882a1d003c12084761046678f7604e02b4d646fe`
- 렌더링: 25쪽
- 구조: 220 block/paragraph, 44 tables, 986 cells, 3 pictures
- 시각 검수: 75 issues (55 errors, 6 warnings in the strict submission report)
- 대표 오류: 저점유 페이지 3쪽, 색상 이탈 11건, 본문 영역 밖 이미지 3건, floating-image flow 위험 3건, 미해결 대상 33건, 지시문 14건, 서명/날짜 빈칸 3건, 더미 식별자 2건
- 본문 스타일 분산: 12개 글꼴 계열, 5–21pt 범위

이 기준선은 새 B 작성이 성공적으로 검수될 때까지 삭제하지 않는다. 기존 생성물과 관련 로그도 별도로 보존한다.

## 구현된 계약

- `editor_server/hwpx-visual-evidence.mjs`: SVG 페이지의 색상, 본문 영역 밖 이미지, 점유율, 제목 page-break/keep-with-next, 본문 글꼴·크기를 정책 기반으로 분석한다.
- `editor_server/editor-gateway.mjs`: review/quality-check에서 통과한 `visualPolicy`의 정규화된 키를 revision precondition으로 기록한다. HWPX verified save/export는 동일한 정책을 다시 제출하지 않으면 `quality_visual_policy_required`로 실패한다.
- 정책 객체의 키 순서는 정렬해 비교하므로 의미가 같은 정책의 JSON 키 순서 변경은 허용한다.
- 법적 전자서명은 별도 기능이다. 텍스트 서명 표시는 문서 저장·재오픈 보존만 검증하며, 인증서/서명 이미지/서명 검증을 주장하지 않는다.

## 실제 검수 증적

1. `npm.cmd run test:hwpx-api`: 245/245 통과.
2. `node --test editor_server/editor-gateway.test.mjs`: 27/27 통과. 검수 정책 불일치 export가 `quality_visual_policy_required`로 거부되고, 동일 정책(키 순서 변경 포함)의 PDF export와 verified save/reopen은 통과했다.
3. 실시간 MCP 레드팀: `tools/redteam_visual_policy_precondition_20260812.mjs` 실행 결과 `ok=true`.
   - 정책 없는 verified save: `quality_visual_policy_required` 거부
   - 키 순서만 바꾼 동일 정책 verified save: 통과
   - artifact read/delete: 통과, 임시 artifact 삭제 완료
   - 상세: `.run/editor-visual-policy-red-team-20260812/result.json`
4. 기존 B 시각 증적: `.run/current-b-inspection-20260812/visual-review-submission.json`
5. 서명 표기 저장·재오픈 증적: `.run/current-b-inspection-20260812/signature-reopened.json`

## 다음 작업 조건

새 B는 원본 `B_서식.hwp`에서 다시 열고, A는 참조 문서로만 사용한다. 각 수정 단계마다 exact target inspect → atomic edit → revision-bound review → page render → verified save/reopen 순서를 지킨다. submission 검수에서 색상, 이미지 흐름, 빈 페이지, 제목 페이지 흐름, 스타일 분산을 명시적으로 정책화하고 통과하기 전에는 최종 산출물로 취급하지 않는다.
