# 타스크 2 - 2단계 완료 보고서: 중간 표현(IR) 데이터 모델 설계 및 구현

## 수행 내용

### 생성된 모듈 구조

`src/model/` 하위에 12개 파일 생성:

| 파일 | 주요 구조체 | 설명 |
|------|-----------|------|
| `mod.rs` | HwpUnit, ColorRef, Point, Rect, Padding | 공통 타입 정의 |
| `document.rs` | Document, Section, SectionDef, FileHeader, DocInfo | 문서 전체 구조 |
| `paragraph.rs` | Paragraph, CharShapeRef, LineSeg, RangeTag | 문단 및 텍스트 |
| `table.rs` | Table, Cell, TableZone | 표 개체 |
| `shape.rs` | CommonObjAttr, ShapeObject, LineShape, RectangleShape, EllipseShape, ArcShape, PolygonShape, CurveShape, GroupShape, TextBox, Caption | 그리기 개체 |
| `image.rs` | Picture, CropInfo, ImageAttr, ImageData | 그림 개체 |
| `style.rs` | CharShape, ParaShape, Style, Font, BorderFill, Fill, GradientFill, TabDef | 스타일 정보 |
| `page.rs` | PageDef, PageBorderFill, ColumnDef, PageAreas | 페이지 레이아웃 |
| `header_footer.rs` | Header, Footer | 머리말/꼬리말 |
| `footnote.rs` | Footnote, Endnote, FootnoteShape | 각주/미주 |
| `control.rs` | Control(enum), AutoNumber, Bookmark, Hyperlink, Ruby, Field 등 | 인라인 컨트롤 |
| `bin_data.rs` | BinData, BinDataContent | 바이너리 데이터 |

### HWP 5.0 스펙 반영 사항

1. **자료형 매핑**: HWPUNIT→u32, SHWPUNIT→i32, HWPUNIT16→i16, COLORREF→u32
2. **글자 모양**: 언어별 7종 글꼴 ID/장평/자간/상대크기, 속성 비트 플래그, 색상 4종
3. **문단 모양**: 여백, 들여쓰기, 줄간격 종류(4종), 정렬(6종), 문단 머리 모양
4. **표**: 행/열, 셀 병합, 셀 여백, 영역 속성, 쪽 나눔 설정
5. **그리기 개체**: 7종(선, 사각형, 타원, 호, 다각형, 곡선, 묶음), 공통 속성, 텍스트 래핑
6. **그림**: 자르기, 밝기/명암, 그림 효과, BinData 참조
7. **용지 설정**: 용지 크기, 9종 여백, 방향, 제책 방법
8. **구역 정의**: 구역별 독립 페이지 설정, 머리말/꼬리말/테두리/배경 감추기 플래그
9. **각주/미주**: 19종 번호 형식, 구분선, 배치 방법
10. **컨트롤**: 15종 필드 타입, 자동번호, 책갈피, 하이퍼링크, 덧말 등

### 빌드 검증 결과

| 빌드 대상 | 결과 |
|----------|------|
| 네이티브 (cargo build) | 성공 |
| 테스트 (cargo test) | 32개 통과 |
| WASM (wasm-pack build) | 성공 |

## 상태

- 완료일: 2026-02-05
- 상태: 승인 완료
