# LinkGuard AI UI

피싱 링크 분석 서비스의 UI 프로토타입입니다. URL 구조 기반 휴리스틱 분석과 서버 기반 VirusTotal/OpenPhish 평판 조회를 함께 사용해 악성 링크 가능성을 판단합니다.

## 실행

```powershell
npm.cmd install
npm.cmd run dev
```

개발 서버는 기본적으로 `http://127.0.0.1:5173/`에서 실행됩니다. 서버는 같은 포트에서 `/api/analyze-url`도 제공합니다. 이미 5173 포트가 사용 중이면 5174처럼 다음 빈 포트를 자동으로 사용합니다.

## Render Docker 배포

이 프로젝트는 Playwright 기반 스크린샷 캡처를 사용하므로 Render에서는 메인 웹앱과 스크린샷 캡처 서비스를 별도 컨테이너로 배포합니다. `Dockerfile`은 React 앱과 일반 API를 실행하고, `Dockerfile.screenshot`은 Playwright 브라우저 캡처 전용 private service를 실행합니다.

1. GitHub/GitLab 저장소에 이 프로젝트를 push합니다.
2. Render Dashboard에서 **New > Blueprint**를 선택하고 저장소의 `render.yaml`을 연결합니다.
3. 생성 화면에서 `sync: false`로 표시되는 비밀 환경변수를 입력합니다.
   - `OPENAI_API_KEY`
   - `VIRUSTOTAL_API_KEY`
   - `GOOGLE_SAFE_BROWSING_API_KEY`
   - `GEMINI_API_KEY`
   - `SCREENSHOT_SERVICE_TOKEN`은 `linkguard-ai`, `linkguard-screenshot` 두 서비스에 같은 값으로 입력합니다.
   - `SCREENSHOT_BUCKET`, `SCREENSHOT_ENDPOINT`, `SCREENSHOT_ACCESS_KEY_ID`, `SCREENSHOT_SECRET_ACCESS_KEY`는 `linkguard-screenshot` 서비스에 입력합니다.
4. 서비스가 배포되면 Render가 제공하는 `https://<service>.onrender.com` 주소로 접속합니다.

Render Web Service는 `0.0.0.0:$PORT`에 바인딩해야 하므로 운영 환경에서는 메인 앱이 `PORT=10000`, 캡처 서비스가 `PORT=10001`을 사용합니다. 메인 앱은 `SCREENSHOT_SERVICE_URL=http://linkguard-screenshot:10001`로 private service를 호출합니다.

로컬에서 분리 구조를 확인하려면 터미널을 두 개 띄웁니다.

```powershell
$env:PORT="10001"
$env:SCREENSHOT_SERVICE_TOKEN="dev-token"
node screenshot-server.mjs
```

```powershell
$env:PORT="5173"
$env:SCREENSHOT_SERVICE_URL="http://127.0.0.1:10001"
$env:SCREENSHOT_SERVICE_TOKEN="dev-token"
node server.mjs --dev
```

### 스크린샷 R2/S3 저장

운영에서는 컨테이너 로컬 디스크가 재배포나 재시작 때 사라질 수 있으므로 스크린샷을 Cloudflare R2 또는 AWS S3에 저장합니다. `SCREENSHOT_STORAGE_DRIVER=s3`를 설정하면 캡처 PNG를 S3 호환 버킷에 업로드하고, 분석 결과의 `screenshotUrl`에는 공개 URL 또는 presigned URL을 반환합니다.

Cloudflare R2 예시:

```powershell
SCREENSHOT_STORAGE_DRIVER=s3
SCREENSHOT_BUCKET=linkguard-screenshots
SCREENSHOT_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
SCREENSHOT_REGION=auto
SCREENSHOT_ACCESS_KEY_ID=<r2-access-key-id>
SCREENSHOT_SECRET_ACCESS_KEY=<r2-secret-access-key>
SCREENSHOT_KEY_PREFIX=screenshots
SCREENSHOT_PUBLIC_BASE_URL=https://screenshots.example.com
```

`SCREENSHOT_PUBLIC_BASE_URL`이 있으면 `https://screenshots.example.com/screenshots/<file>.png` 같은 공개 객체 URL을 사용합니다. 이 값을 비워두면 서버가 24시간짜리 presigned URL을 만들어 반환합니다. 프론트엔드에서 이미지가 오래 열려 있어야 한다면 공개 R2 custom domain을 쓰는 쪽이 더 안정적입니다.

## 평판 DB 설정

기본값으로 `https://openphish.com/feed.txt` 공개 피드를 사용합니다. VirusTotal API 키를 추가하면 VirusTotal URL 리포트를 먼저 조회하고, OpenPhish를 보조 평판 DB로 사용합니다.

```powershell
OPENPHISH_FEED_URL=https://openphish.com/feed.txt
VIRUSTOTAL_API_KEY=your_virustotal_api_key
VIRUSTOTAL_SUBMIT_UNKNOWN=false
```

`VIRUSTOTAL_SUBMIT_UNKNOWN=false`이면 VirusTotal에 기존 리포트가 있는 URL만 조회합니다. `true`로 바꾸면 기존 리포트가 없는 URL을 VirusTotal 분석에 제출합니다. 이 경우 입력 URL이 VirusTotal 서버로 전송되므로 개인정보가 포함된 URL에는 사용하지 마세요.

OpenPhish 피드는 공개적으로 관측된 피싱 URL과의 일치 여부를 확인합니다. 전체 악성 URL을 보장하지 않으므로, 로컬 휴리스틱 분석 결과와 함께 참고용으로 사용해야 합니다.

## 구조

- `src/pages`: 홈, 분석 결과, 보안 교육, 분석 기록, 요금제 페이지
- `src/components`: 공통 레이아웃, 로고, 히어로 비주얼, 점수 링, 상태 배지
- `src/lib`: URL 위험도 분석 엔진과 분석 API 클라이언트
- `src/data`: 화면에 표시되는 목업 데이터와 네비게이션 정의
- `src/styles/global.css`: 디자인 토큰, 전체 레이아웃, 반응형 스타일
- `server.mjs`: 정적 파일 제공, Vite 개발 미들웨어, VirusTotal/OpenPhish 평판 DB 연동 API
- `screenshot-server.mjs`: Playwright 기반 스크린샷 캡처 전용 API

## 다음 기능 연결 위치

- URL 분석 요청: `src/pages/HomePage.jsx`, `src/pages/AnalysisPage.jsx`, `src/lib/linkRiskAnalyzer.js`, `server.mjs`
- 분석 기록 저장/보고서 내보내기: `src/pages/AnalysisPage.jsx`, `src/pages/HistoryPage.jsx`, `src/lib/analysisHistory.js`
- 요금제/결제 플로우: `src/pages/PricingPage.jsx`, `src/data/mockData.js`
- 로그인: `src/components/AppShell.jsx`
