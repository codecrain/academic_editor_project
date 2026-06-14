# DOCX Extra Fonts

DOCX 편집 엔진에서 추가로 읽힐 TTF/OTF/TTC 폰트를 두는 폴더입니다.

기본 런타임은 빌드/설치 단계에서 다음 공개 폰트 패키지를 포함합니다.

- Noto / Noto CJK
- Nanum / Nanum Coding
- Liberation
- Carlito / Croscore
- DejaVu

공공기관 문서나 논문 양식에 필요한 별도 폰트가 있으면 라이선스를 확인한 뒤 이 폴더에 `.ttf`, `.otf`, `.ttc` 파일을 추가하세요. 예를 들어 KoPubWorld TTF/OTF, 기관 지정 배포 폰트, 학회 템플릿 지정 폰트처럼 재배포 조건이 명확한 파일만 넣어야 합니다. 웹용 `.woff2` 파일은 HWPX 브라우저 편집기용이며 DOCX 엔진 폰트로는 사용하지 않습니다.

Docker 런타임은 이 폴더에 `.ttf`, `.otf`, `.ttc` 파일이 있을 때만 `/opt/collaboraoffice/share/fonts/truetype/tlooto`에 읽기 전용으로 마운트합니다. README만 있는 빈 설정 폴더는 무시됩니다. 다른 위치를 쓰려면 `EDITOR_DOCX_EXTRA_FONTS_DIR` 또는 `EDITOR_EXTRA_FONTS_DIR` 환경변수에 폴더 경로를 지정하면 됩니다. 자동 마운트를 끄려면 값을 `none`, `false`, `0`, `off` 중 하나로 설정하세요.
