# 타스크 56: 메뉴 시스템 아키텍처 설계 — 수행계획서

## 개요

타스크 55에서 구현한 7개 메뉴 드롭다운 UI에 커맨드 시스템 아키텍처를 적용한다. 현재 메뉴/툴바/키보드 단축키가 각각 독립된 경로로 처리되는 구조를 통합 커맨드 디스패처로 일원화하고, 문서 상태에 따른 메뉴 항목 동적 활성/비활성 기능과 고객사 커스텀 메뉴 확장 API를 제공한다.

## 현재 문제

1. **분산된 커맨드 라우팅**: 메뉴(`menu-command` 이벤트) / 툴바(`format-toggle`/`format-char` 이벤트) / 키보드(InputHandler.handleCtrlKey 직접 호출) — 3개 경로 독립
2. **컨텍스트 무시**: 메뉴 항목 disabled/enabled가 HTML 하드코딩. 문서 로드 여부, 선택 영역 유무, 표 내부 여부에 따른 동적 상태 갱신 없음
3. **확장 불가**: 고객사 커스텀 메뉴 추가 수단 없음
4. **커맨드 ID 비체계적**: `cut`, `zoom-in`, `insert-table` 등 네임스페이스 없는 평면 문자열

## 목표

- 커맨드 레지스트리 + 통합 디스패처 + 컨텍스트 감응 상태 + 확장 API
- 메뉴/툴바/키보드 3경로 완전 통합
- 기존 동작 무변경 보장 (점진적 마이그레이션)

## 참조

- 한컴 웹기안기 커맨드 시스템: Action ID 기반 Run()/CreateAction() 패턴, Actor/Updater 분리
- 한컴 커맨드 ID: `e_copy`, `d_save`, `p_align` 등 접두사 방식
- 우리 채택: `카테고리:액션` 방식 (예: `edit:copy`, `view:zoom-in`)

## 산출물

- 커맨드 인프라 4개 파일 (types, registry, dispatcher, shortcut-map)
- 커맨드 정의 7개 파일 (file, edit, view, format, insert, table, page)
- 확장 API 1개 파일
- 기존 5개 파일 수정 (main.ts, menu-bar.ts, toolbar.ts, input-handler.ts, index.html)
- 총 신규 ~610줄

## 구현 단계

| 단계 | 내용 | 규모 |
|------|------|------|
| 1단계 | 커맨드 인프라 구축 (types, registry, dispatcher, shortcut-map) | ~220줄 신규 |
| 2단계 | 메뉴바 커맨드 통합 + 컨텍스트 감응 (commands/*, index.html, menu-bar.ts) | ~330줄 신규 |
| 3단계 | 키보드·툴바 통합 + 확장 API (shortcut 통합, toolbar 통합, extension-api.ts) | ~60줄 신규 |
