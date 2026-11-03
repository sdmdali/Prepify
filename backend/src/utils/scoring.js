'use strict';
/**
 * Server-side scoring. Pure functions; no I/O.
 * Rule (derived from the schema: questions.marks, no negative-marking column):
 *   correct answer  -> question.marks
 *   wrong/unanswered -> 0
 */
function scoreAnswers(questions, answersByQuestionId) {
  let score = 0;
  let maxScore = 0;
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  const perQuestion = [];

  for (const q of questions) {
    const marks = Number(q.marks);
    maxScore += marks;
    const selected = answersByQuestionId.get(Number(q.id));
    let isCorrect = null;
    let awarded = 0;
    if (selected === undefined || selected === null) {
      unanswered += 1;
    } else if (Number(selected) === Number(q.correct_index)) {
      isCorrect = 1; awarded = marks; correct += 1;
    } else {
      isCorrect = 0; incorrect += 1;
    }
    score += awarded;
    perQuestion.push({ questionId: Number(q.id), selected: selected ?? null, isCorrect, marksAwarded: awarded });
  }
  const round = (n) => Math.round(n * 100) / 100;
  return {
    score: round(score), maxScore: round(maxScore), correct, incorrect, unanswered,
    percentage: maxScore > 0 ? round((score / maxScore) * 100) : 0,
    perQuestion,
  };
}
module.exports = { scoreAnswers };
