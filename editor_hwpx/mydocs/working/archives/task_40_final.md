# 타스크 40: HWP 저장 기초 기능 구현 - 최종 결과 보고서

## 개요

빈 HWP 문서에 컨트롤을 하나씩 추가 저장하면서 한글 프로그램에서 정상 오픈되는지 검증하고, 각 컨트롤별 저장 기술 문서를 작성하는 타스크.

## 수행 단계 및 결과

### 단계 1: 스펙 교차 검증 및 기술 문서 초안

- HWP 5.0 바이너리 스펙과 HWPML 3.0 스펙 교차 검증 완료
- 컨트롤 타입별 필수 레코드 매트릭스 정리
- `mydocs/tech/hwp_save_guide.md` 초안 작성

### 단계 2: 텍스트 저장 검증

| 파일 | 삽입 텍스트 | HWP 오픈 |
|------|-----------|---------|
| save_test_korean.hwp | 가나다라마바사아 | ✓ |
| save_test_english.hwp | Hello World | ✓ |
| save_test_mixed.hwp | 안녕 Hello 123 !@# | ✓ |

### 단계 3: 표(Table) 저장 검증

| 파일 | 내용 | 레코드 | HWP 오픈 |
|------|------|--------|---------|
| save_test_table_1x1.hwp | 1×1 빈 셀 표 | 21개 (참조 동일) | ✓ |

핵심 발견: 표 문단은 반드시 2개 필요 (표+빈줄), segment_width=0, control_mask=0x00000804

### 단계 4: 이미지(Picture) 저장 검증

| 파일 | 내용 | 레코드 | HWP 오픈 |
|------|------|--------|---------|
| save_test_picture.hwp | 3tigers.jpg 글자처리 삽입 | 15개 (14/15 일치) | ✓ |

핵심 발견: SHAPE_COMPONENT ctrl_id '$pic' 2회 기록, tag=85 (SHAPE_PICTURE), border 좌표 패턴

### 단계 5: 기타 컨트롤 라운드트립 검증

| 샘플 파일 | 대상 컨트롤 | 보존 |
|-----------|-----------|------|
| k-water-rfp.hwp | Header(3), Footer(2), Shape(2), Picture(15), Table(19) | 모두 ✓ |
| 20250130-hongbo.hwp | Shape(1), Picture(4), Table(6) | 모두 ✓ (100% 일치) |
| hwp-multi-001.hwp | Shape(1), Picture(2), Table(26) | 모두 ✓ |
| hwp-multi-002.hwp | Picture(3), Table(7) | 모두 ✓ |
| 2010-01-06.hwp | Footnote(30), Table(12) | 모두 ✓ |

### 추가 검증: 표 안 이미지

| 파일 | 내용 | 레코드 | HWP 오픈 |
|------|------|--------|---------|
| save_test_pic_in_table.hwp | 1×1 표 셀 안 이미지 삽입 | 25개 (21/25 일치) | ✓ |

## 수정/생성 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/wasm_api.rs` | 저장 테스트 함수 7개 추가 |
| `mydocs/tech/hwp_save_guide.md` | 컨트롤별 저장 기술 가이드 (신규, 423줄) |
| `src/serializer/body_text.rs` | raw_break_type 보존 수정 |
| `src/model/paragraph.rs` | raw_break_type 필드 추가 |

## 테스트 함수 목록

| 함수명 | 용도 |
|--------|------|
| test_save_text_only | 한글/영문/혼합 텍스트 저장 |
| test_save_table_1x1 | 1×1 표 FROM SCRATCH 저장 |
| test_analyze_reference_picture | 이미지 참조 파일 분석 |
| test_save_picture | 이미지 FROM SCRATCH 저장 |
| test_analyze_pic_in_table | 표 안 이미지 참조 파일 분석 |
| test_save_pic_in_table | 표 안 이미지 FROM SCRATCH 저장 |
| test_roundtrip_all_controls | 기타 컨트롤 라운드트립 검증 |

## 빌드 검증

- **cargo test**: 473개 전체 통과
- **wasm-pack build**: 빌드 성공

## 산출물

### 기술 문서
- `mydocs/tech/hwp_save_guide.md` — 컨트롤별 저장 기술 가이드
  - 스펙 교차 검증 결과
  - 제어 문자 크기 규칙
  - 컨트롤별 저장 검증 기록
  - 알려진 제약사항

### 저장 테스트 출력 파일
- `output/save_test_korean.hwp`
- `output/save_test_english.hwp`
- `output/save_test_mixed.hwp`
- `output/save_test_table_1x1.hwp`
- `output/save_test_picture.hwp`
- `output/save_test_pic_in_table.hwp`

## 알려진 제약사항

1. Header/Footer LIST_HEADER 직렬화 시 원본 대비 크기 차이 (기능 영향 없음)
2. ColumnDef 확장 속성 미보존 (다단 문서)
3. Endnote/Bookmark 검증 샘플 미확보
4. char_shape_id/para_shape_id 차이 (empty.hwp 기본값 사용 시)

---

**작성일**: 2026-02-11
