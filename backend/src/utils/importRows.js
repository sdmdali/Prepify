'use strict';
/**
 * Converts raw import rows (CSV objects or JSON objects) into the canonical
 * question shape. CSV columns: subject, topic, question, optionA..optionF,
 * correct (A-F), difficulty, marks, explanation.
 * JSON rows may use either the CSV-style keys or {options:[], correctIndex}.
 */
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function normaliseRow(row) {
  const subject = String(row.subject ?? row.subjectSlug ?? '').trim();
  const topic = String(row.topic ?? '').trim() || null;
  const questionText = row.questionText ?? row.question ?? '';
  let options = row.options;
  if (!Array.isArray(options)) {
    options = LETTERS.map((L) => row['option' + L]).filter((v) => v !== undefined && String(v).trim() !== '');
  }
  let correctIndex = row.correctIndex;
  if (correctIndex === undefined) {
    const c = String(row.correct ?? '').trim().toUpperCase();
    correctIndex = LETTERS.indexOf(c);
    if (correctIndex === -1 && /^\d+$/.test(c)) correctIndex = Number(c) - 1; // 1-based numeric allowed
  }
  const difficulty = row.difficulty ? String(row.difficulty).trim().toLowerCase() : 'medium';
  const marks = row.marks === undefined || row.marks === '' ? undefined : Number(row.marks);
  const explanation = row.explanation ? String(row.explanation) : undefined;
  return { subject, topic, question: { questionText, options, correctIndex, difficulty, marks, explanation } };
}
module.exports = { normaliseRow, LETTERS };
