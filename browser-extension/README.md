# LinkGuard URL 감시 도우미 확장 프로그램

Chrome과 Edge에서 사용할 수 있는 Manifest V3 확장 프로그램입니다. 새 웹페이지에 접속하면 현재 URL을 LinkGuard API로 보내 위험도를 확인하고, 페이지 위의 아바타 말풍선으로 결과를 알려줍니다.

URL 변경 감지는 일반 페이지 이동, 탭 전환, 뒤로/앞으로 이동, 해시 변경, SPA의 `history.pushState`/`replaceState` 기반 주소 변경을 포함합니다.

## 로컬 설치

1. 웹앱을 먼저 실행합니다.

```powershell
npm.cmd run dev
```

2. Chrome 또는 Edge에서 확장 프로그램 관리 페이지를 엽니다.
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`

3. 개발자 모드를 켭니다.
4. “압축해제된 확장 프로그램 로드”를 선택합니다.
5. 이 폴더를 선택합니다: `browser-extension`

## API 연결

확장 프로그램은 기존 웹앱의 URL 위험도 분석 API를 그대로 사용합니다.

- 상태 확인: `GET /api/health`
- URL 분석: `POST /api/analyze-url`
- 기본 API 주소: `http://127.0.0.1:5173`

확장 프로그램 상세 화면에서 “확장 프로그램 옵션”을 열고 **API 연결 테스트**를 누르면 `/api/health`와 `/api/analyze-url`을 함께 호출해 연결 상태를 확인합니다.

## 설정

확장 프로그램 상세 화면에서 “확장 프로그램 옵션”을 열어 다음 값을 바꿀 수 있습니다.

- `LinkGuard API 주소`: 기본값은 `http://127.0.0.1:5173`
- `분석 모드`: 일반 분석 또는 전문가 분석
- `아바타 모드 사용`: 페이지 위 아바타 표시 여부

브라우저 내부 페이지(`chrome://`, `edge://`, 확장 프로그램 스토어 등)에는 보안 정책상 아바타를 표시할 수 없습니다.
