const STORAGE_KEY = "linkguard:quiz-mistake-notes";
const STORAGE_EVENT = "linkguard:quiz-mistake-notes-updated";
const MAX_MISTAKE_NOTES = 100;

export function loadQuizMistakeNotes() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeMistakeNote)
      .filter(Boolean)
      .sort((left, right) => right.timestamp - left.timestamp);
  } catch {
    return [];
  }
}

export function saveQuizMistakeNote({ category, question, selectedAnswer }) {
  if (typeof window === "undefined" || !category || !question) {
    return null;
  }

  const previousNotes = loadQuizMistakeNotes();
  const previousNote = previousNotes.find((note) => note.id === question.id);
  const timestamp = Date.now();
  const note = {
    id: question.id,
    categoryId: category.id,
    categoryTitle: category.title,
    correctAnswerLabel: getAnswerLabel(question, question.answer),
    date: formatNoteDate(timestamp),
    explanation: question.explanation,
    missCount: (previousNote?.missCount ?? 0) + 1,
    questionText: question.question,
    questionType: question.type,
    selectedAnswerLabel: getAnswerLabel(question, selectedAnswer),
    timestamp,
  };
  const nextNotes = [
    note,
    ...previousNotes.filter((item) => item.id !== note.id),
  ].slice(0, MAX_MISTAKE_NOTES);

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextNotes));
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT));

  return note;
}

export function removeQuizMistakeNote(noteId) {
  if (typeof window === "undefined") {
    return;
  }

  const nextNotes = loadQuizMistakeNotes().filter((note) => note.id !== noteId);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextNotes));
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
}

export function clearQuizMistakeNotes() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
}

export function subscribeQuizMistakeNotes(callback) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event) => {
    if (!event || event.key === STORAGE_KEY) {
      callback();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STORAGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STORAGE_EVENT, callback);
  };
}

function normalizeMistakeNote(note) {
  if (!note || typeof note !== "object") {
    return null;
  }

  const id = typeof note.id === "string" ? note.id : "";
  const questionText = typeof note.questionText === "string" ? note.questionText : "";

  if (!id || !questionText) {
    return null;
  }

  const timestamp = Number(note.timestamp) || Date.now();

  return {
    id,
    categoryId: typeof note.categoryId === "string" ? note.categoryId : "",
    categoryTitle:
      typeof note.categoryTitle === "string" && note.categoryTitle
        ? note.categoryTitle
        : "보안 퀴즈",
    correctAnswerLabel:
      typeof note.correctAnswerLabel === "string" ? note.correctAnswerLabel : "",
    date:
      typeof note.date === "string" && note.date
        ? note.date
        : formatNoteDate(timestamp),
    explanation: typeof note.explanation === "string" ? note.explanation : "",
    missCount: Math.max(1, Number(note.missCount) || 1),
    questionText,
    questionType: note.questionType === "ox" ? "ox" : "choice",
    selectedAnswerLabel:
      typeof note.selectedAnswerLabel === "string" ? note.selectedAnswerLabel : "",
    timestamp,
  };
}

function getAnswerLabel(question, answer) {
  if (question.type === "ox") {
    return answer ? "O" : "X";
  }

  return question.options?.[answer] ?? "선택 없음";
}

function formatNoteDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
