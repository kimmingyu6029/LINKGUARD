import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import SectionHeader from "../components/SectionHeader.jsx";
import StatusPill from "../components/StatusPill.jsx";
import {
  checklistItems,
  educationTopics,
  lessonCards,
  securityQuizCategories,
} from "../data/mockData.js";
import {
  clearQuizMistakeNotes,
  loadQuizMistakeNotes,
  removeQuizMistakeNote,
  saveQuizMistakeNote,
  subscribeQuizMistakeNotes,
} from "../lib/quizMistakeNotes.js";
import {
  comicLoadingFrames,
  pickRandomStaticComic,
  staticComicCategories,
} from "../lib/staticSecurityComics.js";

const comicLoadingDurationMs = 3000;
const comicFrameDurationMs = 360;
const comicFrameFadeOverlapMs = 120;

export default function EducationPage() {
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    securityQuizCategories[0].id,
  );
  const [answersByCategory, setAnswersByCategory] = useState({});
  const [checkedChecklistItems, setCheckedChecklistItems] = useState({});
  const [mistakeNotes, setMistakeNotes] = useState(() => loadQuizMistakeNotes());
  const [selectedComicCategoryId, setSelectedComicCategoryId] = useState(
    staticComicCategories[0].id,
  );
  const [displayedComic, setDisplayedComic] = useState(null);
  const [isGeneratingComic, setIsGeneratingComic] = useState(false);
  const comicTimerRef = useRef(null);

  useEffect(() => {
    const refreshMistakeNotes = () => setMistakeNotes(loadQuizMistakeNotes());

    refreshMistakeNotes();
    return subscribeQuizMistakeNotes(refreshMistakeNotes);
  }, []);

  const selectedCategory = useMemo(
    () =>
      securityQuizCategories.find((category) => category.id === selectedCategoryId) ??
      securityQuizCategories[0],
    [selectedCategoryId],
  );

  const selectedComicCategory = useMemo(
    () =>
      staticComicCategories.find((category) => category.id === selectedComicCategoryId) ??
      staticComicCategories[0],
    [selectedComicCategoryId],
  );

  useEffect(() => {
    return () => {
      if (comicTimerRef.current) {
        window.clearTimeout(comicTimerRef.current);
      }
    };
  }, []);

  const categoryAnswers = answersByCategory[selectedCategory.id] ?? {};
  const answeredCount = Object.keys(categoryAnswers).length;
  const questionCount = selectedCategory.questions.length;
  const score = selectedCategory.questions.reduce((total, question) => {
    return total + (categoryAnswers[question.id] === question.answer ? 1 : 0);
  }, 0);
  const progress = Math.round((answeredCount / questionCount) * 100);

  const handleSelectAnswer = (questionId, answer) => {
    const question = selectedCategory.questions.find((item) => item.id === questionId);
    const previousAnswer = categoryAnswers[questionId];

    setAnswersByCategory((current) => ({
      ...current,
      [selectedCategory.id]: {
        ...(current[selectedCategory.id] ?? {}),
        [questionId]: answer,
      },
    }));

    if (question && answer !== question.answer && previousAnswer !== answer) {
      saveQuizMistakeNote({
        category: selectedCategory,
        question,
        selectedAnswer: answer,
      });
    }
  };

  const handleResetCategory = () => {
    setAnswersByCategory((current) => {
      const next = { ...current };
      delete next[selectedCategory.id];
      return next;
    });
  };

  const getCategoryProgress = (category) => {
    const answers = answersByCategory[category.id] ?? {};
    return `${Object.keys(answers).length}/${category.questions.length}`;
  };

  const handleReviewMistake = (note) => {
    if (note.categoryId) {
      setSelectedCategoryId(note.categoryId);
    }
  };

  const handleRemoveMistake = (noteId) => {
    removeQuizMistakeNote(noteId);
  };

  const handleClearMistakes = () => {
    clearQuizMistakeNotes();
  };

  const handleToggleChecklistItem = (item) => {
    setCheckedChecklistItems((current) => ({
      ...current,
      [item]: !current[item],
    }));
  };

  const handleSelectComicCategory = (categoryId) => {
    setSelectedComicCategoryId(categoryId);
    setDisplayedComic(null);
    setIsGeneratingComic(false);

    if (comicTimerRef.current) {
      window.clearTimeout(comicTimerRef.current);
      comicTimerRef.current = null;
    }
  };

  const handleGenerateComic = () => {
    if (comicTimerRef.current) {
      window.clearTimeout(comicTimerRef.current);
    }

    setDisplayedComic(null);
    setIsGeneratingComic(true);

    comicTimerRef.current = window.setTimeout(() => {
      setDisplayedComic((current) =>
        pickRandomStaticComic(selectedComicCategory, current?.id),
      );
      setIsGeneratingComic(false);
      comicTimerRef.current = null;
    }, comicLoadingDurationMs);
  };

  return (
    <section className="education-page page-content">
      <SectionHeader
        title="보안 교육"
        subtitle="보안 지식을 배우고 안전한 인터넷 생활을 실천하세요."
      />

      <div className="topic-strip">
        {educationTopics.map((topic) => {
          const Icon = topic.icon;
          return (
            <article className="topic-item" key={topic.title}>
              <Icon size={24} />
              <div>
                <h2>{topic.title}</h2>
                <p>{topic.desc}</p>
              </div>
            </article>
          );
        })}
      </div>

      <section className="panel comic-studio static-comic-studio" aria-labelledby="comic-studio-title">
        <div className="comic-studio-head">
          <div>
            <StatusPill tone="purple" icon={Sparkles}>AI 만화 생성</StatusPill>
            <div className="comic-title-row">
              <h2 id="comic-studio-title">보안 카테고리별 6컷 만화 만들기</h2>
              <Link
                className="cast-intro-button"
                to="/education/characters"
              >
                <BookOpen size={16} />
                등장인물 소개
              </Link>
            </div>
            <p>
              보안 주제를 고르고 만들기 버튼을 누르면 AI가 작업하는 듯한 로딩 뒤에
              준비된 6컷 만화 중 하나가 랜덤으로 표시됩니다.
            </p>
          </div>
          <div className="comic-ai-badge" aria-label="6컷 보안 만화 생성기">
            <Bot size={30} />
            <strong>6컷</strong>
            <span>comic studio</span>
          </div>
        </div>

        <div className="comic-loading-preload" aria-hidden="true">
          {comicLoadingFrames.map((frame) => (
            <img
              key={frame.src}
              src={frame.src}
              alt=""
              loading="eager"
              decoding="async"
            />
          ))}
        </div>

        <div className="static-comic-layout">
          <aside className="static-comic-picker" aria-label="보안 만화 카테고리 선택">
            <div className="cast-title-row">
              <h3>보안 카테고리</h3>
              <span>{selectedComicCategory.comics.length} comics</span>
            </div>
            <div className="static-comic-category-grid">
              {staticComicCategories.map((category) => {
                const Icon = category.icon;
                const isActive = category.id === selectedComicCategory.id;

                return (
                  <button
                    className={["static-comic-category", "tone-" + category.tone, isActive ? "is-active" : ""].filter(Boolean).join(" ")}
                    type="button"
                    key={category.id}
                    onClick={() => handleSelectComicCategory(category.id)}
                    aria-pressed={isActive}
                  >
                    <Icon size={22} />
                    <span>
                      <strong>{category.title}</strong>
                      <small>{category.desc}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="static-comic-stage">
            <div className="comic-result-head">
              <div>
                <h3>{selectedComicCategory.title}</h3>
                <p>
                  {isGeneratingComic
                    ? "AI가 보안 만화를 생성하는 중입니다. 잠시만 기다려주세요."
                    : displayedComic
                      ? displayedComic.title + " 만화가 준비되었습니다."
                      : "만들기를 누르면 이 카테고리의 3개 만화 중 하나가 랜덤으로 나옵니다."}
                </p>
              </div>
              <div className="comic-actions">
                <button
                  className="comic-generate-button"
                  type="button"
                  onClick={handleGenerateComic}
                  disabled={isGeneratingComic}
                >
                  <RefreshCw size={16} />
                  {isGeneratingComic ? "생성 중" : displayedComic ? "다른 만화 만들기" : "만들기"}
                </button>
              </div>
            </div>

            <div className={["static-comic-viewer", isGeneratingComic ? "is-loading" : ""].filter(Boolean).join(" ")} aria-live="polite">
              {isGeneratingComic ? (
                <div className="comic-loading-scene">
                  <div className="comic-loading-frame-stack" role="img" aria-label="AI 이미지 생성 애니메이션">
                    {comicLoadingFrames.map((frame, index) => (
                      <img
                        key={frame.src}
                        className="comic-loading-frame"
                        src={frame.src}
                        alt=""
                        loading="eager"
                        decoding="async"
                        style={{
                          animationDelay: `${index * comicFrameDurationMs - comicFrameFadeOverlapMs}ms`,
                          animationDuration: `${comicLoadingFrames.length * comicFrameDurationMs}ms`,
                        }}
                      />
                    ))}
                  </div>
                  <div>
                    <strong>AI 이미지 생성 중</strong>
                    <span>컷 구성, 캐릭터 배치, 보안 메시지를 정리하고 있어요.</span>
                  </div>
                </div>
              ) : displayedComic ? (
                <figure className="static-comic-result">
                  <img src={displayedComic.src} alt={displayedComic.title + " 6컷 만화"} />
                  <figcaption>
                    <strong>{displayedComic.title}</strong>
                    <span>{selectedComicCategory.title} 카테고리</span>
                  </figcaption>
                </figure>
              ) : (
                <div className="static-comic-empty">
                  <Sparkles size={32} />
                  <strong>{selectedComicCategory.title}</strong>
                  <span>만들기 버튼을 누르면 준비된 만화가 AI 생성처럼 나타납니다.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="panel security-quiz" aria-labelledby="security-quiz-title">
        <div className="quiz-header">
          <div>
            <StatusPill tone="teal">실전 퀴즈</StatusPill>
            <h2 id="security-quiz-title">카테고리별 보안 퀴즈</h2>
            <p>
              관심 있는 주제를 선택하고 오지선다와 OX 문제를 풀며 보안 감각을
              점검해보세요.
            </p>
          </div>
          <div className="quiz-score" aria-live="polite">
            <span>현재 점수</span>
            <strong>
              {score}/{questionCount}
            </strong>
            <small>{answeredCount === questionCount ? "채점 완료" : `${progress}% 진행`}</small>
          </div>
        </div>

        <div className="quiz-shell">
          <nav className="quiz-category-list" aria-label="퀴즈 카테고리">
            {securityQuizCategories.map((category) => {
              const Icon = category.icon;
              const isActive = category.id === selectedCategory.id;

              return (
                <button
                  className={`quiz-category tone-${category.tone} ${
                    isActive ? "is-active" : ""
                  }`}
                  type="button"
                  key={category.id}
                  onClick={() => setSelectedCategoryId(category.id)}
                >
                  <Icon size={22} />
                  <span>
                    <strong>{category.title}</strong>
                    <small>{category.desc}</small>
                  </span>
                  <em>{getCategoryProgress(category)}</em>
                </button>
              );
            })}
          </nav>

          <div className="quiz-board">
            <div className="quiz-board-head">
              <div>
                <h3>{selectedCategory.title}</h3>
                <p>{selectedCategory.desc}</p>
              </div>
              <button
                className="icon-button quiz-reset"
                type="button"
                onClick={handleResetCategory}
                disabled={answeredCount === 0}
              >
                <RotateCcw size={15} />
                다시 풀기
              </button>
            </div>

            <div
              className="quiz-progress"
              role="progressbar"
              aria-label={`${selectedCategory.title} 풀이 진행률`}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={progress}
            >
              <span style={{ width: `${progress}%` }} />
            </div>

            <div className="quiz-question-list">
              {selectedCategory.questions.map((question, index) => {
                const selectedAnswer = categoryAnswers[question.id];
                const isAnswered = selectedAnswer !== undefined;
                const isCorrect = selectedAnswer === question.answer;
                const options =
                  question.type === "ox"
                    ? [
                        { label: "O", value: true },
                        { label: "X", value: false },
                      ]
                    : question.options.map((option, optionIndex) => ({
                        label: option,
                        value: optionIndex,
                      }));

                return (
                  <article
                    className={`quiz-question ${
                      isAnswered ? (isCorrect ? "is-correct" : "is-wrong") : ""
                    }`}
                    key={question.id}
                  >
                    <div className="quiz-question-title">
                      <span>{index + 1}</span>
                      <StatusPill tone={question.type === "ox" ? "green" : "blue"}>
                        {question.type === "ox" ? "OX" : "오지선다"}
                      </StatusPill>
                      <h4>{question.question}</h4>
                    </div>

                    <div className={`quiz-options ${question.type === "ox" ? "is-ox" : ""}`}>
                      {options.map((option, optionIndex) => {
                        const isSelected = selectedAnswer === option.value;
                        const isAnswer = question.answer === option.value;
                        const optionClass = [
                          isSelected ? "is-selected" : "",
                          isAnswered && isAnswer ? "is-answer" : "",
                          isAnswered && isSelected && !isAnswer ? "is-miss" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");

                        return (
                          <button
                            className={optionClass}
                            type="button"
                            key={`${question.id}-${option.value}`}
                            onClick={() => handleSelectAnswer(question.id, option.value)}
                            aria-pressed={isSelected}
                          >
                            <span>
                              {question.type === "ox"
                                ? option.label
                                : optionIndex + 1}
                            </span>
                            <strong>{option.label}</strong>
                          </button>
                        );
                      })}
                    </div>

                    {isAnswered ? (
                      <div
                        className={`quiz-feedback ${
                          isCorrect ? "is-correct" : "is-wrong"
                        }`}
                      >
                        {isCorrect ? <CheckCircle2 size={20} /> : <ShieldAlert size={20} />}
                        <p>
                          <strong>{isCorrect ? "정답입니다." : "다시 확인해보세요."}</strong>
                          {question.explanation}
                        </p>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        </div>

        <section className="mistake-notes" aria-labelledby="mistake-notes-title">
          <div className="mistake-notes-head">
            <div>
              <StatusPill tone="red" icon={BookOpen}>오답노트</StatusPill>
              <h3 id="mistake-notes-title">내가 틀렸던 문제</h3>
              <p>틀린 문제는 자동 저장되며, 브라우저를 닫아도 다시 확인할 수 있습니다.</p>
            </div>
            <div className="mistake-note-actions">
              <span>{mistakeNotes.length}개 저장됨</span>
              <button
                className="icon-button"
                type="button"
                onClick={handleClearMistakes}
                disabled={mistakeNotes.length === 0}
              >
                <Trash2 size={15} />
                전체 삭제
              </button>
            </div>
          </div>

          {mistakeNotes.length > 0 ? (
            <div className="mistake-note-list">
              {mistakeNotes.map((note) => (
                <article className="mistake-note" key={note.id}>
                  <div className="mistake-note-meta">
                    <StatusPill tone={note.questionType === "ox" ? "green" : "blue"}>
                      {note.questionType === "ox" ? "OX" : "오지선다"}
                    </StatusPill>
                    <span>{note.categoryTitle}</span>
                    <time>{note.date}</time>
                    <em>{note.missCount}회 오답</em>
                  </div>
                  <h4>{note.questionText}</h4>
                  <div className="mistake-answer-grid">
                    <div>
                      <span>내 답</span>
                      <strong>{note.selectedAnswerLabel}</strong>
                    </div>
                    <div>
                      <span>정답</span>
                      <strong>{note.correctAnswerLabel}</strong>
                    </div>
                  </div>
                  <p>{note.explanation}</p>
                  <div className="mistake-note-buttons">
                    <button
                      className="soft-button"
                      type="button"
                      onClick={() => handleReviewMistake(note)}
                    >
                      다시 풀러 가기
                      <ArrowRight size={15} />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => handleRemoveMistake(note.id)}
                    >
                      <Trash2 size={15} />
                      삭제
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mistake-empty">
              <BookOpen size={28} />
              <p>아직 저장된 오답이 없습니다. 틀린 문제는 여기에 자동으로 모입니다.</p>
            </div>
          )}
        </section>
      </section>

      <div className="education-layout">
        <article className="panel feature-lesson">
          <div className="phone-visual">
            <div className="phone-frame">
              <div className="message-card">
                <strong>[택배 알림]</strong>
                <span>배송이 지연되었습니다.</span>
                <small>확인하기: http://...</small>
              </div>
              <div className="warning-badge">
                <ShieldAlert size={30} />
              </div>
            </div>
          </div>
          <div className="lesson-copy">
            <StatusPill tone="blue">중급 콘텐츠</StatusPill>
            <h2>택배 사칭 스미싱 구별법</h2>
            <p>
              최근 급증하는 택배 사칭 스미싱의 주요 특징과 구별 방법,
              실제 예시를 통해 예방해보세요.
            </p>
            <Link className="soft-button" to="/analysis">
              자세히 보기
              <ArrowRight size={15} />
            </Link>
          </div>
        </article>

        <div className="lesson-card-grid">
          {lessonCards.map((card) => {
            const Icon = card.icon;
            return (
              <article className="mini-lesson" key={card.title}>
                <Icon size={22} />
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.desc}</p>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="panel education-checklist">
          <h2>링크 클릭 전 체크리스트</h2>
          <ul>
            {checklistItems.map((item) => {
              const isChecked = Boolean(checkedChecklistItems[item]);

              return (
                <li className={isChecked ? "is-checked" : ""} key={item}>
                  <label className="checklist-option">
                    <input
                      checked={isChecked}
                      className="checklist-input"
                      onChange={() => handleToggleChecklistItem(item)}
                      type="checkbox"
                    />
                    <span className="empty-check" aria-hidden="true" />
                    <span>{item}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="security-tip">
            <CheckCircle2 size={26} />
            <p>하나라도 해당되면 앞으로 가지 말고, 공식 채널로 직접 확인하세요.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
