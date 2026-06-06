import { useEffect } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import SectionHeader from "../components/SectionHeader.jsx";
import StatusPill from "../components/StatusPill.jsx";
import { securityComicCharacters } from "../data/securityComicCharacters.js";

export default function CharacterIntroPage() {
  useEffect(() => {
    const castCards = Array.from(document.querySelectorAll("[data-security-cast-card]"));

    if (castCards.length === 0) {
      return undefined;
    }

    if (!("IntersectionObserver" in window)) {
      castCards.forEach((card) => card.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.24 },
    );

    castCards.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, []);

  return (
    <section className="character-intro-page page-content">
      <Link className="back-link" to="/education">
        <ArrowLeft size={16} />
        보안 교육으로 돌아가기
      </Link>

      <SectionHeader
        title="등장인물 소개"
        subtitle="용용이, 오박사, 민수, 민지를 새 페이지에서 여유 있게 확인하세요."
      />

      <section
        className="panel security-cast-section character-intro-panel"
        aria-labelledby="security-cast-title"
      >
        <div className="security-cast-head">
          <StatusPill tone="green" icon={BookOpen}>등장인물 소개</StatusPill>
          <h2 id="security-cast-title">만화 속 보안 친구들</h2>
          <p>캐릭터별 성격과 역할을 확인한 뒤 보안 만화 만들기로 돌아갈 수 있습니다.</p>
        </div>

        <div className="security-cast-list">
          {securityComicCharacters.map((character, index) => (
            <article
              className={`security-cast-card tone-${character.tone}`}
              data-security-cast-card
              key={character.id}
              style={{ "--cast-index": index }}
            >
              <figure className="security-cast-portrait">
                <img src={character.image} alt={`${character.name} 등장인물 이미지`} />
              </figure>
              <div className="security-cast-copy">
                <span className="security-cast-number">{String(index + 1).padStart(2, "0")}</span>
                <strong>{character.role}</strong>
                <h3>{character.name}</h3>
                <p>{character.description}</p>
                <div className="security-cast-traits" aria-label={`${character.name} 특징`}>
                  {character.traits.map((trait) => (
                    <span key={trait}>{trait}</span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
