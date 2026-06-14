# 타스크 84 구현계획서: 표/셀 속성 다이얼로그

## 구현 단계 (5단계)

### 1단계: WASM API (Rust)

`src/wasm_api.rs`에 4개 API 추가:

1. **`getCellProperties(sec, ppi, ci, cellIdx)`** → JSON
   - 반환: `{ width, height, paddingLeft, paddingRight, paddingTop, paddingBottom, verticalAlign, textDirection, isHeader }`
   - 단위: HWPUNIT 그대로 (프론트에서 mm 변환)

2. **`setCellProperties(sec, ppi, ci, cellIdx, json)`** → Result
   - 입력: 위 필드 중 변경된 것만 포함된 JSON
   - Cell 구조체 직접 수정 + 재렌더링 트리거

3. **`getTableProperties(sec, ppi, ci)`** → JSON
   - 반환: `{ cellSpacing, paddingLeft, paddingRight, paddingTop, paddingBottom, pageBreak, repeatHeader }`

4. **`setTableProperties(sec, ppi, ci, json)`** → Result
   - 입력: 위 필드 중 변경된 것만 포함된 JSON
   - Table 구조체 직접 수정 + 재렌더링 트리거

기존 `get_table_dimensions_native` 패턴 참조. `&mut self.document` 접근을 위해 set 함수들은 `&mut self` 사용.

**완료 기준**: `docker compose run --rm test` 통과

---

### 2단계: TypeScript 타입 + WASM 브릿지

1. `rhwp-studio/src/core/types.ts`에 인터페이스 추가:
   ```ts
   interface CellProperties {
     width: number; height: number;
     paddingLeft: number; paddingRight: number;
     paddingTop: number; paddingBottom: number;
     verticalAlign: number; // 0=top, 1=center, 2=bottom
     textDirection: number; // 0=horizontal, 1=vertical
     isHeader: boolean;
   }
   interface TableProperties {
     cellSpacing: number;
     paddingLeft: number; paddingRight: number;
     paddingTop: number; paddingBottom: number;
     pageBreak: number; // 0=none, 1=cellBreak
     repeatHeader: boolean;
   }
   ```

2. `rhwp-studio/src/core/wasm-bridge.ts`에 4개 메서드 추가:
   - `getCellProperties(sec, ppi, ci, cellIdx): CellProperties`
   - `setCellProperties(sec, ppi, ci, cellIdx, props): {ok:boolean}`
   - `getTableProperties(sec, ppi, ci): TableProperties`
   - `setTableProperties(sec, ppi, ci, props): {ok:boolean}`

**완료 기준**: Vite 빌드 성공

---

### 3단계: 탭 다이얼로그 UI + CSS 스타일

1. `rhwp-studio/src/style.css`에 탭 UI 스타일 추가:
   - `.dialog-tabs` (탭 헤더 바)
   - `.dialog-tab` (개별 탭 버튼)
   - `.dialog-tab.active` (선택된 탭)
   - `.dialog-tab-panel` (탭 콘텐츠 패널)
   - `.dialog-checkbox` (체크박스 스타일)
   - `.dialog-btn-group` (버튼 그룹 — 세로정렬 등)

2. `rhwp-studio/src/ui/table-cell-props-dialog.ts` 신규 생성:
   - ModalDialog 확장, 탭 전환 지원
   - **표 탭** (활성): 쪽 나눔 라디오, 제목줄 체크박스, 모든 셀 안여백 4개
   - **셀 탭** (활성): 크기(너비/높이), 안여백(4방향), 세로정렬(3버튼), 세로쓰기(2버튼), 제목셀 체크박스, 한줄로/셀보호/필드이름(disabled)

**완료 기준**: Vite 빌드 성공, 다이얼로그 표시 시 탭 전환 동작

---

### 4단계: 기본/여백캡션/테두리/배경 탭 UI (향후 연결용)

1. **기본 탭**: 크기(너비/높이 disabled), 위치(disabled), 배치(disabled), 개체 보호(disabled)
2. **여백/캡션 탭**: 바깥 여백(disabled), 캡션 위치/크기/간격(disabled)
3. **테두리 탭**: 선 종류/굵기/색(disabled), 미리보기(disabled), 셀 간격(활성 — table.cell_spacing)
4. **배경 탭**: 채우기 없음/색/무늬/그러데이션/그림(모두 disabled)

모든 컨트롤은 DOM 참조를 인스턴스 멤버로 보관하여 향후 활성화 가능하게 설계.

**완료 기준**: Vite 빌드 성공, 6개 탭 모두 표시

---

### 5단계: 커맨드 연결 + 빌드/검증

1. `table.ts`의 `table:cell-props` 스텁에 실행 로직 추가:
   - 현재 커서의 표/셀 위치 조회
   - TableCellPropsDialog 생성 + show()
   - 다이얼로그에서 WASM API로 속성 조회 → 필드 채우기
   - 확인 버튼 → setCellProperties/setTableProperties → document-changed 이벤트

2. WASM 빌드 (`docker compose run --rm wasm`)
3. Vite 빌드 확인
4. 웹 검증: 표 내 우클릭 → "표/셀 속성" → 다이얼로그 표시 → 값 확인 → 수정 → 적용 확인

**완료 기준**: 전체 빌드 성공, 다이얼로그에서 표/셀 속성 조회 및 수정 동작
