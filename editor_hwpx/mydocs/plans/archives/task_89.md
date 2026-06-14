# 타스크 89: HWPX 파일 처리 지원 — 수행계획서

## 1. 목표

HWPX(XML 기반 HWP) 파일을 파싱하여 기존 `Document` 모델로 변환, 뷰어/편집기에서 HWP 바이너리와 동일하게 처리할 수 있도록 한다.

## 2. 배경

- HWPX는 KS X 6101:2024 표준의 XML 기반 문서 포맷 (ZIP 패키지)
- 한컴오피스 2022+ 에서 기본 저장 포맷으로 사용 확대 중
- 현재 rhwp는 HWP 바이너리(.hwp)만 지원

## 3. HWPX 포맷 구조

```
document.hwpx (ZIP)
├── version.xml              # 버전 정보
├── META-INF/
│   ├── manifest.xml         # 패키지 매니페스트
│   └── container.xml        # 컨테이너 정보
├── Contents/
│   ├── content.hpf          # 패키지 파일 목록 (OPF)
│   ├── header.xml           # 문서 메타데이터 (글꼴, 스타일, 문단모양 등)
│   ├── section0.xml         # 섹션 본문 (문단, 표, 이미지 등)
│   ├── section1.xml         # ...
│   └── masterpage0.xml      # 마스터페이지
└── BinData/                 # 이미지, 임베디드 파일
    ├── image01.png
    └── image02.jpg
```

## 4. 핵심 XML 네임스페이스

| 접두사 | URI | 용도 |
|--------|-----|------|
| `hp` | `http://www.hancom.co.kr/hwpml/2011/paragraph` | 문단, 텍스트 런, 표 |
| `hs` | `http://www.hancom.co.kr/hwpml/2011/section` | 섹션 구조 |
| `hh` | `http://www.hancom.co.kr/hwpml/2011/head` | 헤더 메타데이터 |
| `hc` | `http://www.hancom.co.kr/hwpml/2011/core` | 코어 요소 |
| `ha` | `http://www.hancom.co.kr/hwpml/2011/app` | 앱 데이터 |
| `hpf` | `http://www.hancom.co.kr/schema/2011/hpf` | 패키지 구조 |

## 5. 통합 전략

```
HWPX (ZIP+XML)  ─→  parse_hwpx()  ─→  Document 모델  ─→  [기존 파이프라인]
HWP (CFB+Binary) ─→  parse_hwp()  ─→  Document 모델  ─→  compose → paginate → render
```

**핵심**: HWPX 파서는 기존 `Document` 모델을 출력한다. 이후 조판/페이지네이션/렌더링/편집 파이프라인은 변경 없이 재사용.

**포맷 자동 감지**: 파일 매직 바이트로 구분
- `D0 CF 11 E0` → HWP (CFB/OLE)
- `50 4B 03 04` → HWPX (ZIP)

## 6. 참고 자료

| 자료 | 경로 |
|------|------|
| Python HWPX 파서 | `/home/edward/vsworks/shwp/hwp_semantic/hwpx/` |
| Rust openhwp HWPX 크레이트 | `/home/edward/vsworks/shwp/openhwp/crates/hwpx/` |
| HWPX 스펙 문서 | `/home/edward/vsworks/shwp/openhwp/docs/hwpx/` |
| python-hwpx 라이브러리 | `/home/edward/vsworks/shwp/python-hwpx/` |
| 샘플 HWPX 파일 | `/home/edward/vsworks/shwp/samples/hwpx/`, `samples/seoul/` |

## 7. 범위

### 포함 (1차)

- ZIP 컨테이너 읽기
- header.xml 파싱 (글꼴, 글자모양, 문단모양, 스타일, 테두리/배경)
- section*.xml 파싱 (문단, 텍스트 런, 표, 이미지)
- BinData 이미지 로딩
- 포맷 자동 감지 (HWP/HWPX)
- 웹 프론트엔드 .hwpx 파일 수용
- 기본 컨트롤 (섹션 정의, 탭, 줄바꿈)

### 제외 (향후)

- HWPX 내보내기/저장
- 고급 컨트롤 (필드, 책갈피, 머리말/꼬리말, 각주)
- 그리기 객체 (도형, 텍스트아트)
- OLE, 수식, 차트
- 변경 추적, 디지털 서명
- 암호화 문서

## 8. 필요 의존성 추가

```toml
# Cargo.toml
zip = "2.6"          # ZIP 컨테이너 읽기
quick-xml = "0.37"   # XML 파싱
```

## 9. 예상 파일 구조

```
src/parser/
├── mod.rs                 # 수정: parse_hwpx() 노출, 포맷 감지
└── hwpx/
    ├── mod.rs             # HWPX 파서 진입점
    ├── reader.rs          # ZIP 컨테이너 읽기
    ├── header.rs          # header.xml → DocInfo 변환
    ├── section.rs         # section*.xml → Section 변환
    └── content.rs         # content.hpf 파싱 (섹션 목록)
```

## 10. 검증 방법

1. 샘플 HWPX 파일 로드 → Document 모델 생성 확인
2. 웹 뷰어에서 HWPX 파일 렌더링 확인 (기존 HWP와 동일한 레이아웃)
3. Rust 테스트: HWPX 파싱 → 섹션/문단/표 구조 검증
4. 기존 HWP 기능 회귀 테스트 통과
