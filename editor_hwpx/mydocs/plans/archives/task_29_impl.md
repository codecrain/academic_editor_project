# 타스크 29 구현 계획서: 읽기전용 HWP를 저장가능한 HWP로 변환

## 분석 결과

현재 코드의 파싱-직렬화 파이프라인을 분석한 결과, **배포용 문서 변환의 90%는 이미 구현되어 있다**.

### 이미 동작하는 부분
1. `parser/crypto.rs`: ViewText 복호화 (AES-128 ECB + zlib)
2. `parser/mod.rs`: distribution이면 ViewText 경로로 분기, 복호화 후 일반 모델로 변환
3. `serializer/cfb_writer.rs`: 항상 `BodyText/Section*`으로 저장 (ViewText 미생성)
4. `parser/mod.rs:collect_extra_streams()`: ViewText 스트림은 이미 제외됨

### 수정이 필요한 부분
1. **FileHeader**: `raw_data`가 있으면 원본(distribution=true)을 그대로 반환 → distribution bit 제거 필요
2. **DocInfo**: `raw_stream`에 `HWPTAG_DISTRIBUTE_DOC_DATA` 레코드가 포함되어 있을 수 있음 → 제거 필요
3. **API**: 변환 기능을 CLI/WASM에서 사용할 수 있도록 공개

---

## 구현 단계 (3단계)

### 1단계: Document 변환 로직 (model + serializer)

**파일**: `src/model/document.rs`

`Document::convert_to_editable()` 메서드 추가:
```rust
impl Document {
    /// 배포용(읽기전용) 문서를 편집 가능한 일반 문서로 변환
    pub fn convert_to_editable(&mut self) {
        if !self.header.distribution { return; }

        // 1. FileHeader: distribution 플래그 제거
        self.header.distribution = false;
        self.header.flags &= !0x04;  // bit 2 제거
        self.header.raw_data = None;  // 원본 대신 재생성

        // 2. DocInfo: DISTRIBUTE_DOC_DATA 레코드 제거
        self.doc_info.raw_stream = None;  // 재직렬화 유도
        self.doc_info.extra_records.retain(|r| r.tag_id != HWPTAG_DISTRIBUTE_DOC_DATA);

        // 3. BodyText: 이미 복호화된 상태이므로 추가 처리 불필요
        // raw_stream은 복호화된 데이터를 포함하므로 보존 가능
    }
}
```

**파일**: `src/serializer/header.rs`

변경 없음 — `raw_data = None`이면 `flags` 필드로 재생성하므로 자동으로 distribution bit가 제거됨.

**테스트**:
- `test_convert_to_editable_clears_distribution`: 플래그 변환 확인
- `test_convert_to_editable_noop_for_normal`: 일반 문서에서는 변경 없음

### 2단계: CLI/WASM API 추가

**파일**: `src/main.rs`

`convert` 서브커맨드 추가:
```
rhwp convert input.hwp output.hwp
```
- 입력 파일 파싱
- `convert_to_editable()` 호출
- `serialize_hwp()`로 저장

**파일**: `src/wasm_api.rs`

`convertToEditable()` WASM API 추가:
```rust
#[wasm_bindgen(js_name = convertToEditable)]
pub fn convert_to_editable(&mut self) -> String
```
- 내부 Document에서 `convert_to_editable()` 호출
- JSON 반환: `{"ok":true,"wasDistribution":true}`

### 3단계: 테스트 및 검증

**배포용 샘플 확인**:
- `samples/` 디렉토리에서 distribution=true인 파일 확인
- 없으면 프로그래매틱하게 배포용 문서 시뮬레이션 테스트

**테스트 케이스**:
1. 배포용 문서 파싱 → 변환 → 직렬화 → 재파싱: 내용 동일 확인
2. 변환 후 FileHeader flags에서 bit 2가 0인지 확인
3. 변환 후 BodyText 스트림으로 저장되는지 확인 (ViewText 없음)
4. 일반 문서에 convert_to_editable 호출해도 무변경 확인
5. 기존 384개 테스트 통과

---

## 변경 파일 요약

| 파일 | 변경 내용 |
|------|----------|
| `src/model/document.rs` | `convert_to_editable()` 메서드 추가 |
| `src/main.rs` | `convert` CLI 서브커맨드 |
| `src/wasm_api.rs` | `convertToEditable` WASM API |
| `src/parser/tags.rs` | HWPTAG_DISTRIBUTE_DOC_DATA 상수 확인/추가 |

## 위험 요소

- DocInfo `raw_stream`에 DISTRIBUTE_DOC_DATA가 포함되어 있을 경우, `raw_stream = None`으로 재직렬화하면 해당 레코드가 `extra_records`에서 관리됨 → `extra_records`에서도 제거 필요
- 배포용 문서에서 `\005HwpSummaryInformation` 등 추가 스트림의 차이 확인 필요
