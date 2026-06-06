export default function ScoreRing({
  caption = "AI 분석 기준",
  label = "피싱 의심 링크",
  score,
  tone = "danger",
}) {
  const angle = Math.max(0, Math.min(100, score)) * 3.6;

  return (
    <div className={`score-block tone-${tone}`}>
      <div className="score-ring" style={{ "--score-angle": `${angle}deg` }}>
        <div className="score-inner">
          <strong>{score}</strong>
          <span>/100</span>
        </div>
      </div>
      <div className="score-copy">
        <p>{label}</p>
        <span>{caption}</span>
      </div>
    </div>
  );
}
