export const comicCharacters = [
  {
    id: "yongyongi",
    name: "용용이",
    role: "지식 많은 보안 펫",
    description:
      "풍부한 보안 지식을 갖고 있으며 민수와 민지에게 핵심 정보를 콕 집어 알려줍니다.",
    avatar: "용",
  },
  {
    id: "doctor-oh",
    name: "오박사",
    role: "탑급 보안 박사",
    description:
      "젠틀하고 지적인 보안 전문가로, 어려운 원리를 차분하게 풀어주는 멘토입니다.",
    avatar: "오",
  },
  {
    id: "minsu",
    name: "민수",
    role: "장난기 많은 엉뚱한 친구",
    description:
      "호기심이 앞서 실수할 뻔하지만, 웃긴 상황을 만들며 배움을 끌어냅니다.",
    avatar: "수",
  },
  {
    id: "minji",
    name: "민지",
    role: "공손하고 영리한 친구",
    description:
      "민수의 친한 친구로, 침착하게 단서를 찾고 안전한 선택을 제안합니다.",
    avatar: "지",
  },
];

const fallbackTopic = "생활 보안";

const topicGuides = [
  {
    keywords: ["스미싱", "피싱", "문자", "택배", "링크", "url", "URL", "도메인"],
    label: "낯선 링크",
    risk: "급한 말투와 낯선 주소로 클릭을 유도하는 사기일 수 있어요.",
    villainMove: "공식 안내처럼 보이는 짧은 링크를 던집니다.",
    safeAction: "문자 속 링크 대신 공식 앱이나 즐겨찾기 주소로 직접 확인합니다.",
    checklist: ["발신자와 공식 채널 비교", "URL 철자 확인", "개인정보 입력 전 멈춤"],
  },
  {
    keywords: ["비밀번호", "패스워드", "계정", "로그인", "2fa", "2단계", "인증"],
    label: "계정 보호",
    risk: "같은 비밀번호를 여러 곳에 쓰면 한 곳의 유출이 다른 계정으로 번질 수 있어요.",
    villainMove: "유출된 비밀번호로 다른 서비스에도 로그인을 시도합니다.",
    safeAction: "서비스마다 다른 긴 비밀번호를 쓰고 2단계 인증을 켭니다.",
    checklist: ["비밀번호 재사용 금지", "관리자 앱 사용", "2단계 인증 활성화"],
  },
  {
    keywords: ["개인정보", "주민번호", "전화번호", "주소", "계좌", "인증번호"],
    label: "개인정보 보호",
    risk: "과도한 정보 입력 요구는 사기나 계정 탈취의 시작일 수 있어요.",
    villainMove: "이벤트나 본인확인처럼 꾸며 민감한 정보를 요구합니다.",
    safeAction: "수집 주체와 목적이 명확한지 확인하고, 인증번호는 절대 공유하지 않습니다.",
    checklist: ["필수 입력 항목 확인", "수집 목적 확인", "인증번호 공유 금지"],
  },
  {
    keywords: ["악성코드", "랜섬웨어", "앱", "설치", "파일", "첨부", "apk", "exe"],
    label: "악성 파일",
    risk: "출처가 불분명한 파일은 기기 감염이나 랜섬웨어 피해로 이어질 수 있어요.",
    villainMove: "쿠폰, 청첩장, 보안 업데이트 파일처럼 포장해 설치를 유도합니다.",
    safeAction: "공식 스토어와 공식 사이트에서만 설치하고 중요한 파일은 백업합니다.",
    checklist: ["출처 불명 파일 실행 금지", "공식 스토어 이용", "정기 백업"],
  },
  {
    keywords: ["와이파이", "wifi", "Wi-Fi", "공공", "카페", "공유기"],
    label: "공공 와이파이",
    risk: "가짜 와이파이나 암호화되지 않은 네트워크에서는 정보가 노출될 수 있어요.",
    villainMove: "무료 와이파이 이름을 비슷하게 만들어 접속을 기다립니다.",
    safeAction: "민감한 로그인은 피하고, 공식 네트워크 이름을 확인합니다.",
    checklist: ["네트워크 이름 확인", "민감한 로그인 피하기", "공유 설정 끄기"],
  },
];

const minsuGags = [
  (topic) => `민수는 "${topic}"이라는 말을 보자마자 손가락이 먼저 출발하려고 합니다.`,
  (topic) => `민수는 "${topic}"을 해결한다며 클릭부터 하려다 모두의 시선을 받습니다.`,
  (topic) => `민수는 "${topic}" 경고를 보고도 "5초면 되겠지?"라고 말합니다.`,
];

const closingLines = [
  "멈추고, 확인하고, 공식 경로로 이동!",
  "급할수록 링크 대신 공식 앱!",
  "의심되면 입력하지 말고 한 번 더 확인!",
];

export function createSecurityComic(rawTopic, seed = 0) {
  const topic = normalizeTopic(rawTopic);
  const guide = pickTopicGuide(topic);
  const gag = minsuGags[Math.abs(seed) % minsuGags.length](topic);
  const closing = closingLines[Math.abs(seed) % closingLines.length];

  return {
    topic,
    title: `${topic} 6컷 보안 만화`,
    summary: `${guide.label} 상황을 용용이, 오박사, 민수, 민지가 함께 풀어가는 짧은 보안 교육 만화입니다.`,
    checklist: guide.checklist,
    panels: [
      {
        id: "opening",
        number: 1,
        title: "수상한 시작",
        scene: gag,
        characters: ["민수", "민지"],
        dialogue: [
          { speaker: "민수", text: "어? 이거 누르면 바로 해결되는 거 아니야?" },
          { speaker: "민지", text: "잠깐만. 너무 급하게 클릭하라고 하면 먼저 의심해야 해." },
        ],
        tip: "급한 표현은 대표적인 위험 신호입니다.",
      },
      {
        id: "signal",
        number: 2,
        title: "단서 찾기",
        scene: `${guide.villainMove} 민지는 문장과 주소를 차분히 비교합니다.`,
        characters: ["민지", "용용이"],
        dialogue: [
          { speaker: "민지", text: "주소가 공식 사이트랑 조금 달라 보여요." },
          { speaker: "용용이", text: "좋은 발견이야! 보안은 작은 철자 차이를 보는 눈에서 시작하지." },
        ],
        tip: guide.risk,
      },
      {
        id: "explain",
        number: 3,
        title: "용용이의 핵심 설명",
        scene: "용용이가 꼬리를 살랑이며 보안 개념을 쉬운 비유로 풀어줍니다.",
        characters: ["용용이", "민수", "민지"],
        dialogue: [
          { speaker: "용용이", text: `${topic}에서는 '진짜처럼 보이게 만들기'가 가장 흔한 함정이야.` },
          { speaker: "민수", text: "진짜 같아서 더 위험한 거구나. 내 손가락, 잠시 대기!" },
        ],
        tip: "진짜와 비슷해 보이는 화면일수록 출처 확인이 필요합니다.",
      },
      {
        id: "doctor",
        number: 4,
        title: "오박사의 진단",
        scene: "오박사가 체크리스트를 꺼내 위험 신호를 하나씩 표시합니다.",
        characters: ["오박사", "용용이"],
        dialogue: [
          { speaker: "오박사", text: `이 경우 핵심은 '${guide.safeAction}'입니다.` },
          { speaker: "용용이", text: "맞아요. 바로 행동하기보다 확인 절차를 먼저 세워야 해요." },
        ],
        tip: guide.checklist.join(" · "),
      },
      {
        id: "action",
        number: 5,
        title: "안전한 선택",
        scene: "민지가 공식 경로로 확인하고, 민수는 수상한 화면을 닫습니다.",
        characters: ["민지", "민수", "오박사"],
        dialogue: [
          { speaker: "민지", text: "공식 앱에서 확인하니 그런 알림은 없었어요." },
          { speaker: "민수", text: "와, 클릭했으면 큰일 날 뻔했네. 오늘은 내가 배우는 역할!" },
        ],
        tip: guide.safeAction,
      },
      {
        id: "wrap",
        number: 6,
        title: "오늘의 보안 주문",
        scene: "네 캐릭터가 함께 오늘의 보안 문장을 외치며 마무리합니다.",
        characters: ["용용이", "오박사", "민수", "민지"],
        dialogue: [
          { speaker: "오박사", text: "보안은 겁주는 것이 아니라 안전하게 확인하는 습관입니다." },
          { speaker: "모두", text: closing },
        ],
        tip: `${topic}이 다시 나타나면 오늘의 체크리스트를 떠올리세요.`,
      },
    ],
  };
}

export function formatSecurityComicScript(comic) {
  return [
    comic.title,
    comic.summary,
    "",
    "체크리스트",
    ...comic.checklist.map((item) => `- ${item}`),
    "",
    ...comic.panels.flatMap((panel) => [
      `${panel.number}. ${panel.title}`,
      `장면: ${panel.scene}`,
      ...panel.dialogue.map((line) => `${line.speaker}: ${line.text}`),
      `포인트: ${panel.tip}`,
      "",
    ]),
  ].join("\n");
}

function normalizeTopic(rawTopic) {
  const topic = String(rawTopic ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return topic ? topic.slice(0, 42) : fallbackTopic;
}

function pickTopicGuide(topic) {
  const normalizedTopic = topic.toLowerCase();
  return (
    topicGuides.find((guide) =>
      guide.keywords.some((keyword) => normalizedTopic.includes(keyword.toLowerCase())),
    ) ?? {
      label: "생활 보안",
      risk: "낯선 요청, 과도한 정보 요구, 급한 결정을 유도하는 흐름은 모두 위험 신호가 될 수 있어요.",
      villainMove: "평범한 알림처럼 보이게 만들어 사용자의 방심을 노립니다.",
      safeAction: "출처를 확인하고, 민감한 정보 입력 전 한 번 멈춥니다.",
      checklist: ["출처 확인", "개인정보 입력 전 멈춤", "공식 경로 이용"],
    }
  );
}
