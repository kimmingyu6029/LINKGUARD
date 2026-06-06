import {
  KeyRound,
  LockKeyhole,
  MessageSquareWarning,
  Router,
  ShieldAlert,
  Smartphone,
} from "lucide-react";

export const comicLoadingFrames = Array.from({ length: 8 }, (_, index) => ({
  alt: `AI 이미지 생성 애니메이션 ${index + 1}`,
  src: `/ai_image/ai_image_${index + 1}.png`,
}));

export const staticComicCategories = [
  {
    desc: "택배, 청첩장, 과태료처럼 링크 클릭을 유도하는 문자 사기",
    folder: "smishing",
    icon: MessageSquareWarning,
    id: "smishing",
    title: "스미싱 문자",
    tone: "red",
    comics: [
      { id: "smishing-1", title: "수상한 택배 문자", src: "/story_image/smishing/스미싱 1.png" },
      { id: "smishing-2", title: "급하게 누르라는 링크", src: "/story_image/smishing/스미싱 2.png" },
      { id: "smishing-3", title: "공식 앱으로 확인하기", src: "/story_image/smishing/스미싱 3.png" },
    ],
  },
  {
    desc: "은행, 포털, 학교 로그인 화면을 흉내 낸 가짜 사이트",
    folder: "phishing",
    icon: ShieldAlert,
    id: "phishing",
    title: "피싱 사이트",
    tone: "purple",
    comics: [
      { id: "phishing-1", title: "가짜 로그인 화면", src: "/story_image/phishing/피싱 1.png" },
      { id: "phishing-2", title: "주소 철자 확인", src: "/story_image/phishing/피싱 2.png" },
      { id: "phishing-3", title: "공식 주소로 이동", src: "/story_image/phishing/피싱 3.png" },
    ],
  },
  {
    desc: "출처 불명의 앱, APK, 원격제어 앱 설치를 유도하는 공격",
    folder: "malignity app",
    icon: Smartphone,
    id: "malignity-app",
    title: "악성 앱 설치",
    tone: "warn",
    comics: [
      { id: "malignity-app-1", title: "수상한 앱 설치", src: "/story_image/malignity app/앱 1.png" },
      { id: "malignity-app-2", title: "권한 요청 확인", src: "/story_image/malignity app/앱 2.png" },
      { id: "malignity-app-3", title: "공식 스토어 이용", src: "/story_image/malignity app/앱 3.png" },
    ],
  },
  {
    desc: "비밀번호 재사용, 쉬운 비밀번호, 2단계 인증의 중요성",
    folder: "password",
    icon: KeyRound,
    id: "password",
    title: "비밀번호 보안",
    tone: "green",
    comics: [
      { id: "password-1", title: "비밀번호 재사용 위험", src: "/story_image/password/비밀번호 1.png" },
      { id: "password-2", title: "긴 비밀번호 만들기", src: "/story_image/password/비밀번호 2.png" },
      { id: "password-3", title: "2단계 인증 켜기", src: "/story_image/password/비밀번호3.png" },
    ],
  },
  {
    desc: "인증번호, 주민번호, 계좌번호 같은 민감 정보 보호",
    folder: "personal imformation",
    icon: LockKeyhole,
    id: "personal-information",
    title: "개인정보 보호",
    tone: "blue",
    comics: [
      { id: "personal-information-1", title: "인증번호 공유 금지", src: "/story_image/personal imformation/개인정보 1.png" },
      { id: "personal-information-2", title: "과도한 정보 요구", src: "/story_image/personal imformation/개인정보 2.png" },
      { id: "personal-information-3", title: "입력 전 확인", src: "/story_image/personal imformation/개인정보 3.png" },
    ],
  },
  {
    desc: "가짜 와이파이, 공용 네트워크, 기기 잠금과 업데이트 습관",
    folder: "wifi",
    icon: Router,
    id: "wifi",
    title: "공공 와이파이",
    tone: "teal",
    comics: [
      { id: "wifi-1", title: "가짜 와이파이 조심", src: "/story_image/wifi/wifi 1.png" },
      { id: "wifi-2", title: "공용 네트워크 사용법", src: "/story_image/wifi/wifi 2.png" },
      { id: "wifi-3", title: "기기 보안 습관", src: "/story_image/wifi/wifi 3.png" },
    ],
  },
];

export function pickRandomStaticComic(category, previousComicId = "") {
  const candidates =
    category.comics.length > 1
      ? category.comics.filter((comic) => comic.id !== previousComicId)
      : category.comics;
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index] ?? category.comics[0];
}
