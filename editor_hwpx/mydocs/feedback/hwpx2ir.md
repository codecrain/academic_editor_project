# 이슈

hwpx 를 렌더링할 경우 표, 이미지, 문단의 레이아웃 배치 문제 발생.
한컴 프로그램에서 문제가 되는 hwpx 파일을 hwp 로 변환 한 후 rhwp-studio 로 열면 정상 렌더링됨.

# 생각해야 할 지점

hwpx 의 xml 로 정의된 컨트롤을 IR 로 인코딩할 때, hwp 는 정상적으로 되지만 hwpx 는 비정상적으로 속성 설정이 되는 경우는 어디서 기인하는가?

컨트롤 자체의 렌더링에는 문제가 없지만, 높이 계산과 배치에서 문제가 발생한다는 것은 hwp를 IR  로 인코딩하는 것과 동일하게 hwpx 를 IR 로 인코딩하면 전혀 문제가 생기지 않을 것 이라는 논리적 예측이 가능함.

# 문제는 어디서 나오나?
hwpx 의 문단을 IR 로 인코딩할때?
표, 이미지등의 컨트롤을 IR로 인코딩할 때?
왜 hwpx 만 문단 간격에서 문제가 발생하는가?

# 분석 결과 (2026-03-21)

## 근본 원인
HWP와 HWPX의 LINE_SEG 생성 방식 차이:
- **HWP 바이너리**: LINE_SEG는 한컴이 사전 계산한 결과. 모든 개체(표, 이미지 등)의 높이가 vpos에 이미 반영됨
- **HWPX XML**: `<hp:lineseg>` 태그의 값을 그대로 사용. 비-TAC TopAndBottom 표/이미지의 높이가 vpos에 미포함

## 증상
- 비-TAC TopAndBottom 표/이미지 이후 문단이 개체 위에 오버래핑
- TAC 표의 LINE_SEG lh에 표 높이가 포함되지 않아 문단 간격 과소

## 현재 대응 (사후 패치)
- `document.rs` vpos 재계산: 비-TAC TopAndBottom Picture/Table 높이를 사후에 vpos에 가산
- `layout.rs` vpos 하향 보정: 누적 오차가 큰 경우 y_offset을 줄이는 방향으로 보정
- 문제: 패치마다 HWP 회귀 위험, 케이스별 분기가 복잡해짐

## 올바른 해결 방향

### 설계 원칙
- **렌더러는 하나**: HWP/HWPX 구분 없이 IR만 보고 렌더링 (렌더러에 HWPX 전용 패치 금지)
- **인코딩 단계에서 IR 동등성 보장**: HWPX→IR에서 HWP에 있지만 HWPX에 없는 값을 계산하여 채움

### 한컴의 추정 동작 모델
한컴 워드프로세서는 HWPX 로딩 시 내부적으로 HWP 컨트롤 구조로 1:1 변환 후 LINE_SEG를 재계산.
따라서 HWPX에 LINE_SEG(linesegarray)가 없는 것은 정상 — 뷰어가 계산해야 함.

### HWPX에 없고 HWP에 있는 값 (IR 비교로 확인)
1. **본문 문단의 linesegarray 전체**: HWPX는 본문 문단에 linesegarray를 포함하지 않음 (셀 내부만 포함)
2. **TAC 표 문단의 LINE_SEG lh**: HWP는 표 높이를 lh에 포함 (예: lh=4091), HWPX 기본 생성 시 lh=100
3. **비-TAC TopAndBottom 개체 이후 vpos**: HWP는 개체 높이를 후속 문단 vpos에 반영

### 구현 방향
HWPX→IR 인코딩 단계에서 LINE_SEG를 계산:
1. 글꼴 크기 × 줄간격으로 기본 lh 계산
2. TAC 컨트롤이 있으면 lh = max(글꼴 lh, 컨트롤 높이)
3. 비-TAC TopAndBottom 개체 높이를 후속 문단 vpos에 가산
4. 렌더러의 HWPX 전용 패치(layout.rs vpos 하향 보정 등) 제거
