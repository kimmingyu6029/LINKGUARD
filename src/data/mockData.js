import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  Banknote,
  BookOpen,
  Bot,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileDown,
  GraduationCap,
  Landmark,
  Link2,
  Lock,
  MailWarning,
  MessageSquareWarning,
  Network,
  PackageCheck,
  ReceiptText,
  Route,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Truck,
  Users,
  Zap,
} from "lucide-react";

export const quickActions = [
  { label: "AI 위험도 분석", icon: Bot, to: "/analysis" },
  { label: "악성 도메인 탐지", icon: ShieldAlert, to: "/analysis" },
  { label: "실시간 보안 리포트", icon: ReceiptText, to: "/history" },
  { label: "일반인 모드 / 전문가 모드", icon: Users, to: "/education" },
];

export const recentCases = [
  {
    text: "여행 예약 플랫폼 해킹으로 인한 스미싱 주의 권고",
    date: "2026.05.12",
    summary: "여행 예약 플랫폼 해킹 이슈를 미끼로 예약 확인, 환불, 보상 안내처럼 보이는 문자를 보내고 링크 클릭을 유도하는 유형입니다.",
    impact: "예약 정보, 계정 로그인 정보, 결제 정보 입력을 요구하는 페이지로 이어질 수 있어 문자 속 링크 접근을 피해야 합니다.",
    actions: ["예약 내역은 앱이나 공식 홈페이지에 직접 접속해 확인", "문자 링크에서 로그인이나 결제정보 입력 중단", "이미 입력했다면 비밀번호 변경과 카드사 확인"],
    source: "KISA 보호나라",
    sourceUrl: "https://www.boho.or.kr/kr/bbs/list.do?bbsId=B0000133&menuNo=205020",
  },
  {
    text: "유류비, 주유 지원금 등 중동 사태를 악용한 스미싱 주의 권고",
    date: "2026.03.16",
    summary: "중동 사태와 유류비 부담을 악용해 주유 지원금, 환급, 보조금 신청처럼 꾸민 문자로 사용자를 속이는 유형입니다.",
    impact: "정부 지원금 신청 페이지처럼 보이게 만든 뒤 개인정보, 계좌 정보, 인증번호 입력을 요구할 수 있습니다.",
    actions: ["지원금 안내는 정부·지자체 공식 채널에서 직접 확인", "인증번호와 계좌 비밀번호 입력 금지", "의심 문자는 118 상담이나 KISA 보호나라에서 확인"],
    source: "KISA 보호나라",
    sourceUrl: "https://www.boho.or.kr/kr/bbs/list.do?bbsId=B0000133&menuNo=205020",
  },
  {
    text: "설 명절 연휴기간 스미싱, 피싱 등 사이버 사기 주의",
    date: "2026.02.12",
    summary: "명절 기간 택배, 선물, 교통위반, 가족 사칭 메시지처럼 일상적인 상황을 악용하는 사이버 사기 유형입니다.",
    impact: "연휴 중 확인이 늦어지는 틈을 노려 악성 앱 설치, 계정 탈취, 금융 피해로 이어질 수 있습니다.",
    actions: ["택배와 과태료는 공식 앱·홈페이지에서 직접 확인", "가족·지인 요청은 전화 등 별도 채널로 확인", "앱 설치 파일은 문자 링크에서 내려받지 않기"],
    source: "KISA 보호나라",
    sourceUrl: "https://www.boho.or.kr/kr/bbs/list.do?bbsId=B0000133&menuNo=205020",
  },
];

export const recentCaseSource = {
  label: "KISA 보호나라 보안공지",
  pageUrl: "https://www.boho.or.kr/kr/bbs/list.do?bbsId=B0000133&menuNo=205020",
  rssUrl: "https://www.boho.or.kr/kr/rss.do?bbsId=B0000133",
  updatedAt: "2026.05.20",
};

export const safeChecklist = [
  "URL을 복사해 분석 도구에 확인하기",
  "도메인과 기관명을 꼭 비교하기",
  "이상하게 긴 URL이면 클릭하지 않기",
];

export const phishingTypes = [
  { label: "택배 사칭", icon: Truck },
  { label: "기관/금융", icon: Landmark },
  { label: "공유 사칭", icon: Lock },
  { label: "지인 사칭", icon: Users },
];

export const educationTopics = [
  { title: "피싱이란?", desc: "의심의 기준을 빠르게 익힘", icon: ShieldAlert },
  { title: "스미싱이란?", desc: "스마트폰 문자를 구별", icon: MessageSquareWarning },
  { title: "악성 URL 특징", desc: "낯선 링크를 보는 핵심 포인트", icon: Link2 },
  { title: "한국형 사례", desc: "국내에서 자주 발생하는 유형", icon: Banknote },
  { title: "대처 방법", desc: "피해 예방과 대응 요령", icon: ClipboardCheck },
];

export const lessonCards = [
  {
    title: "금융기관 사칭",
    desc: "은행/카드사를 사칭한 결제 승인 메시지",
    icon: Landmark,
  },
  {
    title: "정부기관 사칭",
    desc: "정부/공공기관을 사칭한 과태료 안내",
    icon: Building2,
  },
  {
    title: "중고거래 안전결제",
    desc: "안전결제 링크처럼 꾸민 가짜 주소",
    icon: PackageCheck,
  },
  {
    title: "청첩장/부고 스미싱",
    desc: "지인 사칭 메시지를 활용한 앱 설치 유도",
    icon: MailWarning,
  },
];

export const checklistItems = [
  "발신자/기관이 공식적인 채널인지 확인한다",
  "URL을 자세히 확인한다",
  "어색한 맞춤법이나 요구가 있는지 확인한다",
  "개인정보 입력을 요구하면 반드시 의심한다",
  "의심되면 실행이나 결제를 멈춘다",
];

export const securityQuizCategories = [
  {
    id: "malicious-url",
    title: "악성 URL 판별",
    desc: "주소 구조와 위험 신호를 빠르게 구분합니다.",
    icon: Link2,
    tone: "blue",
    questions: [
      {
        id: "url-1",
        type: "choice",
        question: "다음 중 악성 URL을 의심해야 하는 가장 강한 신호는?",
        options: [
          "공식 도메인과 철자가 다르고 긴 숫자·문자가 붙어 있다",
          "주소가 https://로 시작한다",
          "도메인에 기관명이 그대로 들어 있다",
          "주소가 짧고 기억하기 쉽다",
          "검색 결과 첫 페이지에 노출된다",
        ],
        answer: 0,
        explanation: "공식 도메인과 비슷하게 보이도록 철자를 바꾸거나 불필요하게 긴 값이 붙으면 사칭 가능성이 큽니다.",
      },
      {
        id: "url-2",
        type: "ox",
        question: "https://가 붙어 있으면 링크는 무조건 안전하다.",
        answer: false,
        explanation: "HTTPS는 통신 암호화를 뜻할 뿐, 사이트 운영자가 신뢰할 수 있다는 보장은 아닙니다.",
      },
      {
        id: "url-3",
        type: "choice",
        question: "단축 URL을 받았을 때 가장 안전한 행동은?",
        options: [
          "바로 눌러서 최종 주소를 확인한다",
          "보낸 사람이 지인이면 아무 문제 없다",
          "미리보기나 분석 도구로 최종 목적지를 확인한다",
          "문자에 적힌 고객센터 번호로 전화한다",
          "주소가 짧으니 안전하다고 판단한다",
        ],
        answer: 2,
        explanation: "단축 URL은 실제 목적지를 숨길 수 있으므로 분석 도구나 미리보기 기능으로 확인하는 편이 안전합니다.",
      },
      {
        id: "url-4",
        type: "ox",
        question: "공식 사이트는 검색이나 즐겨찾기로 직접 접속하는 것이 링크 클릭보다 안전하다.",
        answer: true,
        explanation: "문자·메일 속 링크보다 직접 접속이 사칭 페이지에 유도될 가능성을 줄입니다.",
      },
    ],
  },
  {
    id: "phishing-smishing",
    title: "피싱·스미싱",
    desc: "메일과 문자 사칭 수법을 알아봅니다.",
    icon: MessageSquareWarning,
    tone: "red",
    questions: [
      {
        id: "phishing-1",
        type: "choice",
        question: "스미싱 메시지에서 자주 보이는 표현은?",
        options: [
          "내일까지 보안 점검이 예정되어 있습니다",
          "배송 실패, 과태료, 결제 승인 등 긴급 확인을 요구한다",
          "공식 홈페이지 공지사항을 안내한다",
          "개인정보를 절대 입력하지 말라고 안내한다",
          "상담 시간과 대표 번호만 적혀 있다",
        ],
        answer: 1,
        explanation: "긴급함을 이용해 링크 클릭이나 앱 설치를 유도하는 표현은 스미싱의 대표적인 특징입니다.",
      },
      {
        id: "phishing-2",
        type: "ox",
        question: "지인 이름으로 온 청첩장 링크도 출처가 불분명하면 열지 않아야 한다.",
        answer: true,
        explanation: "지인 사칭 스미싱은 연락처 탈취 뒤 확산되는 경우가 있어 별도 채널로 확인하는 것이 좋습니다.",
      },
      {
        id: "phishing-3",
        type: "choice",
        question: "피싱 메일을 받았을 때 올바른 대응은?",
        options: [
          "첨부파일을 열어 내용을 확인한다",
          "메일의 링크에서 로그인해 진위를 확인한다",
          "공식 앱이나 직접 입력한 주소로 접속해 확인한다",
          "메일에 회신해 발신자에게 문의한다",
          "주변 사람에게 그대로 전달해 물어본다",
        ],
        answer: 2,
        explanation: "메일 안의 링크·첨부파일을 사용하지 말고 공식 경로로 직접 접속해 확인해야 합니다.",
      },
      {
        id: "phishing-4",
        type: "ox",
        question: "맞춤법이 어색하거나 문장이 부자연스러우면 피싱 가능성을 의심할 수 있다.",
        answer: true,
        explanation: "어색한 문장, 과도한 긴급성, 개인정보 요구가 함께 보이면 위험 신호로 봐야 합니다.",
      },
    ],
  },
  {
    id: "password-security",
    title: "비밀번호 보안",
    desc: "계정 탈취를 막는 인증 습관을 익힙니다.",
    icon: Lock,
    tone: "green",
    questions: [
      {
        id: "password-1",
        type: "choice",
        question: "가장 안전한 비밀번호 관리 방법은?",
        options: [
          "모든 사이트에서 같은 비밀번호를 쓴다",
          "이름과 생일을 조합해 기억하기 쉽게 만든다",
          "메모장 파일에 모든 비밀번호를 저장한다",
          "사이트마다 다른 긴 비밀번호를 쓰고 관리자 앱을 활용한다",
          "비밀번호를 주기적으로 지인에게 알려 백업한다",
        ],
        answer: 3,
        explanation: "서비스마다 다른 긴 비밀번호를 쓰면 한 곳이 유출되어도 다른 계정으로 피해가 번지는 것을 막을 수 있습니다.",
      },
      {
        id: "password-2",
        type: "ox",
        question: "2단계 인증은 비밀번호가 유출되어도 계정 탈취 위험을 낮춰준다.",
        answer: true,
        explanation: "2단계 인증은 추가 확인 절차를 요구하므로 공격자가 비밀번호만으로 로그인하기 어렵게 만듭니다.",
      },
      {
        id: "password-3",
        type: "choice",
        question: "비밀번호가 유출된 것으로 의심될 때 가장 먼저 해야 할 일은?",
        options: [
          "같은 비밀번호를 쓰는 모든 계정의 비밀번호를 바꾼다",
          "며칠 더 지켜본다",
          "브라우저 방문 기록만 삭제한다",
          "친구에게 대신 로그인해달라고 부탁한다",
          "비밀번호를 더 짧게 바꿔 기억하기 쉽게 만든다",
        ],
        answer: 0,
        explanation: "재사용한 비밀번호가 있다면 공격자가 여러 서비스에 시도할 수 있으므로 즉시 모두 변경해야 합니다.",
      },
      {
        id: "password-4",
        type: "ox",
        question: "비밀번호에 특수문자 하나만 넣으면 짧아도 충분히 안전하다.",
        answer: false,
        explanation: "길이와 예측 불가능성이 중요합니다. 짧은 비밀번호는 특수문자가 있어도 쉽게 추측될 수 있습니다.",
      },
    ],
  },
  {
    id: "privacy",
    title: "개인정보 보호",
    desc: "민감 정보 입력과 공유를 신중히 판단합니다.",
    icon: Database,
    tone: "purple",
    questions: [
      {
        id: "privacy-1",
        type: "choice",
        question: "개인정보 입력을 요구하는 페이지에서 먼저 확인할 것은?",
        options: [
          "페이지 색상이 공식 사이트와 비슷한지",
          "혜택 문구가 얼마나 큰지",
          "주소, 운영 주체, 개인정보 처리 목적이 명확한지",
          "입력 칸이 적어서 빠르게 끝나는지",
          "친구가 이미 참여했는지",
        ],
        answer: 2,
        explanation: "개인정보는 수집 주체와 목적, 보관·이용 안내가 명확한 공식 채널에서만 입력해야 합니다.",
      },
      {
        id: "privacy-2",
        type: "ox",
        question: "주민등록번호, 인증번호, 계좌 비밀번호는 문자나 메신저로 요청받아도 공유하면 안 된다.",
        answer: true,
        explanation: "금융기관이나 공공기관은 문자·메신저로 민감 정보를 직접 요구하지 않습니다.",
      },
      {
        id: "privacy-3",
        type: "choice",
        question: "이벤트 참여 링크가 개인정보를 과도하게 요구할 때 올바른 판단은?",
        options: [
          "상품이 크면 입력한다",
          "개인정보 입력 후 바로 탈퇴한다",
          "필수 입력 항목이 많으면 사칭 가능성을 의심한다",
          "SNS 공유 수가 많으면 믿어도 된다",
          "주소창을 보지 않고 디자인만 확인한다",
        ],
        answer: 2,
        explanation: "이벤트 목적과 무관한 민감 정보나 과도한 항목을 요구하면 개인정보 탈취를 의심해야 합니다.",
      },
      {
        id: "privacy-4",
        type: "ox",
        question: "일회용 인증번호는 본인 확인용이므로 다른 사람에게 알려주면 안 된다.",
        answer: true,
        explanation: "인증번호를 넘기면 공격자가 본인인 것처럼 인증 절차를 통과할 수 있습니다.",
      },
    ],
  },
  {
    id: "malware-ransomware",
    title: "악성코드·랜섬웨어",
    desc: "감염을 막고 피해를 줄이는 방법을 배웁니다.",
    icon: AlertTriangle,
    tone: "warn",
    questions: [
      {
        id: "malware-1",
        type: "choice",
        question: "랜섬웨어 피해를 줄이는 가장 기본적인 대비는?",
        options: [
          "중요 파일을 별도 저장소에 정기적으로 백업한다",
          "모든 보안 알림을 끈다",
          "출처 불명 프로그램을 자주 설치한다",
          "운영체제 업데이트를 미룬다",
          "감염 후에만 백신을 설치한다",
        ],
        answer: 0,
        explanation: "정기 백업은 파일이 암호화되더라도 복구 가능성을 높이는 가장 현실적인 대비입니다.",
      },
      {
        id: "malware-2",
        type: "ox",
        question: "출처를 모르는 apk, exe, 압축 파일은 실행하지 않는 것이 안전하다.",
        answer: true,
        explanation: "악성코드는 앱 설치 파일이나 압축 파일로 위장해 유포되는 경우가 많습니다.",
      },
      {
        id: "malware-3",
        type: "choice",
        question: "악성 앱 설치를 유도하는 스미싱의 흔한 방식은?",
        options: [
          "공식 앱스토어 검색을 안내한다",
          "운영체제 업데이트 내역만 보여준다",
          "문자 속 링크에서 파일을 직접 내려받게 한다",
          "앱 권한 요청을 전혀 하지 않는다",
          "설치 전 보안 교육 자료를 제공한다",
        ],
        answer: 2,
        explanation: "공식 스토어가 아닌 링크에서 설치 파일을 받게 하면 악성 앱 감염 위험이 큽니다.",
      },
      {
        id: "malware-4",
        type: "ox",
        question: "보안 업데이트를 꾸준히 적용하면 알려진 취약점을 이용한 감염 위험을 줄일 수 있다.",
        answer: true,
        explanation: "업데이트는 이미 알려진 취약점을 막는 핵심 방어 수단입니다.",
      },
    ],
  },
];

export const analysisSignals = [
  { label: "URL 구조", value: "위험", icon: Link2, tone: "danger" },
  { label: "도메인 유사도", value: "높음", icon: Network, tone: "danger" },
  { label: "HTTPS 여부", value: "위험", icon: Lock, tone: "danger" },
  { label: "단축 URL", value: "아니요", icon: Route, tone: "safe" },
  { label: "의심 키워드", value: "발견", icon: AlertTriangle, tone: "danger" },
  { label: "한국형 키워드", value: "발견", icon: BadgeCheck, tone: "danger" },
  { label: "리다이렉트 가능성", value: "높음", icon: Route, tone: "danger" },
  { label: "피싱 유도 가능성", value: "높음", icon: Archive, tone: "danger" },
];

export const recommendations = [
  "링크 클릭 금지",
  "개인정보 입력 금지",
  "공식 앱/홈페이지 직접 접속",
  "의심 문자 삭제",
];

export const historyRows = [
  {
    url: "https://delivery-korea-notice.com/track/123456",
    date: "2024-05-16 10:32",
    score: 84,
    result: "위험",
    tone: "danger",
  },
  {
    url: "https://secure-bank-login.co.kr/auth",
    date: "2024-05-16 09:15",
    score: 72,
    result: "위험",
    tone: "danger",
  },
  {
    url: "https://event.koreapost-k.com/gift",
    date: "2024-05-15 17:48",
    score: 45,
    result: "주의",
    tone: "warn",
  },
  {
    url: "https://www.koreapost.go.kr/",
    date: "2024-05-15 11:22",
    score: 12,
    result: "안전",
    tone: "safe",
  },
  {
    url: "https://bit.ly/3xYh3Ap",
    date: "2024-05-14 16:05",
    score: 66,
    result: "주의",
    tone: "warn",
  },
  {
    url: "https://wedding-invite123.com/letter",
    date: "2024-05-14 09:55",
    score: 33,
    result: "주의",
    tone: "warn",
  },
  {
    url: "https://www.naver.com/",
    date: "2024-05-13 22:10",
    score: 8,
    result: "안전",
    tone: "safe",
  },
];

export const historySummary = [
  { label: "총 분석 수", value: "7", meta: "전체 기간", icon: ShieldCheck, tone: "blue" },
  { label: "위험 링크 수", value: "2", meta: "28.6%", icon: Siren, tone: "red" },
  { label: "이번 주 탐지", value: "5", meta: "+25%", icon: Sparkles, tone: "green" },
];

export const analysisCreditPacks = [
  {
    id: "single",
    name: "1회 검사권",
    audience: "가끔 의심 링크를 확인하는 개인에게 적합",
    credits: 1,
    price: 900,
    unitLabel: "1회 900원",
    icon: ClipboardCheck,
    tone: "blue",
    cta: "1회 검사권 구매",
    features: ["전문가 모드 1회 분석", "리다이렉트 경로 확인", "외부 평판 결과 요약"],
  },
  {
    id: "thirty",
    name: "30회 검사권",
    audience: "개인이 한 달 동안 부담 없이 쓰기 좋은 구성",
    credits: 30,
    price: 9900,
    unitLabel: "1회 330원",
    icon: PackageCheck,
    tone: "teal",
    cta: "30회 검사권 구매",
    popular: true,
    features: ["전문가 모드 30회 분석", "분석 기록 저장", "위험 근거 상세 설명"],
  },
  {
    id: "hundred",
    name: "100회 검사권",
    audience: "가족, 동아리, 소규모 팀의 반복 검사에 적합",
    credits: 100,
    price: 24900,
    unitLabel: "1회 249원",
    icon: ShieldCheck,
    tone: "primary",
    cta: "100회 검사권 구매",
    features: ["전문가 모드 100회 분석", "대량 의심 링크 확인에 유리", "구독 전 테스트 용도"],
  },
];

export const pricingPlans = [
  {
    name: "Free",
    audience: "개인 기본 사용자에게 적합",
    price: "무료",
    priceMeta: "",
    monthlyPrice: 0,
    icon: Users,
    tone: "blue",
    cta: "무료로 시작하기",
    to: "/analysis",
    features: ["기본 URL 분석", "간단한 AI 설명", "일일 분석 횟수 제한 (10회)", "기본 보안 교육 콘텐츠"],
  },
  {
    name: "Pro",
    audience: "개인 파워 사용자에게 적합",
    price: "월 4,900원",
    priceMeta: "월 6,000원",
    monthlyPrice: 4900,
    monthlyListPrice: 6000,
    icon: Zap,
    tone: "primary",
    cta: "Pro 시작하기",
    to: "/analysis",
    popular: true,
    features: ["상세 AI 분석 설명", "분석 기록 저장 (무제한)", "PDF 리포트 다운로드", "전문가 모드 제공", "광고 제거"],
  },
  {
    name: "Team",
    audience: "팀 또는 동아리/소규모 조직에 적합",
    price: "월 19,900원",
    priceMeta: "월 24,900원",
    monthlyPrice: 19900,
    monthlyListPrice: 24900,
    icon: Users,
    tone: "teal",
    cta: "Team 시작하기",
    to: "/history",
    features: ["전문가 모드 제공", "다중 URL 일괄 분석", "팀원 공유 기능 (최대 20명)", "공동 분석 기록", "한글 보고서 내보내기"],
  },
  {
    name: "Business",
    audience: "기업 및 기관에 적합",
    price: "월 49,000원 ~",
    priceMeta: "맞춤형 요금제",
    monthlyPrice: 49000,
    priceSuffix: " ~",
    icon: Building2,
    tone: "purple",
    cta: "도입 문의하기",
    to: "/education",
    features: ["전문가 모드 제공", "관리자 대시보드", "피싱 신고 관리", "조직 보안 리포트", "API 연동"],
  },
];

export const comparisonRows = [
  ["월 분석 가능 횟수", "일 10회", "무제한", "무제한", "무제한", CalendarDays],
  ["AI 설명", "기본", "상세", "상세", "상세", Bot],
  ["PDF 리포트", "×", "✓", "✓", "✓", FileDown],
  ["분석 기록 저장", "3일", "무제한", "무제한", "무제한", Database],
  ["전문가 모드", "×", "✓", "✓", "✓", Sparkles],
  ["다중 URL 분석", "×", "×", "✓", "✓", Network],
  ["관리자 대시보드", "×", "×", "기본", "✓", ReceiptText],
  ["API 제공", "×", "×", "제한적", "✓", Link2],
  ["전용 지원", "×", "×", "이메일 지원", "우선 지원", Users],
];

export const valueProps = [
  { title: "학생/동아리 할인 가능", desc: "학생 및 동아리 인증 시 추가 할인 혜택 제공", icon: GraduationCap },
  { title: "연간 구독 할인", desc: "연간 결제 시 20% 할인으로 더 합리적으로", icon: BadgeCheck },
  { title: "보안 교육 자료 제공", desc: "모든 유료 플랜에 전문 보안 교육 콘텐츠 제공", icon: BookOpen },
  { title: "언제든 요금제 변경 가능", desc: "필요에 따라 언제든 업그레이드/다운그레이드", icon: Route },
];

export const faqs = [
  {
    q: "무료 플랜으로 무엇을 할 수 있나요?",
    a: "기본 URL 분석, 간단한 AI 설명, 일일 10회까지 분석, 기본 보안 교육 콘텐츠를 이용할 수 있습니다.",
  },
  {
    q: "언제든 요금제를 변경할 수 있나요?",
    a: "네. 기능이나 사용량이 필요할 때 즉시 업그레이드할 수 있으며, 하위 플랜 변경은 다음 결제 주기부터 적용됩니다.",
  },
  {
    q: "기업용 도입은 어떻게 문의하나요?",
    a: "Business 플랜의 도입 문의하기 버튼을 통해 요청을 남기면 전담 담당자가 빠르게 연락드립니다.",
  },
];
