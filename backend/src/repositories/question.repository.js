"use strict";
const { query } = require("../config/database");
const LETTERS = "ABCDEF";
const letterFor = (i) => LETTERS[i] || null;
const indexFor = (key) =>
  key ? LETTERS.indexOf(String(key).toUpperCase()) : -1;

async function hydrate(rows, includeAnswers, conn) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const opts = await query(
    "SELECT question_id, option_key, option_text FROM question_options WHERE question_id IN (?) ORDER BY question_id, option_key",
    [ids],
    conn,
  );
  const byQ = new Map();
  for (const o of opts) {
    const id = Number(o.question_id);
    if (!byQ.has(id)) byQ.set(id, []);
    const item = { index: indexFor(o.option_key), text: o.option_text };
    if (includeAnswers)
      item.isCorrect =
        String(o.option_key).toUpperCase() ===
        String(
          rows.find((r) => Number(r.id) === id)?.correct_option_key || "",
        ).toUpperCase();
    byQ.get(id).push(item);
  }
  return rows.map((r) => ({
    id: Number(r.id),
    subjectId: Number(r.subject_id),
    topicId: r.topic_id == null ? null : Number(r.topic_id),
    questionText: r.question_text,
    difficulty: String(r.difficulty || "MEDIUM").toLowerCase(),
    marks: Number(r.marks ?? 1),
    ...(includeAnswers
      ? {
          explanation: r.explanation || null,
          source: r.source_reference || "AI",
        }
      : {}),
    options: byQ.get(Number(r.id)) || [],
  }));
}

async function insert(conn, { subjectId, topicId, q, source }) {
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6)
    throw new Error("Question must contain 2-6 options.");
  const correctKey = letterFor(q.correctIndex);
  if (!correctKey || q.correctIndex >= q.options.length)
    throw new Error("Question correct option is invalid.");
  const r = await query(
    `INSERT INTO questions (subject_id, topic_id, question_text, difficulty, question_type, correct_option_key, explanation, source_reference, active)
     VALUES (?, ?, ?, ?, 'MCQ', ?, ?, ?, 1)`,
    [
      subjectId,
      topicId || null,
      q.questionText,
      String(q.difficulty || "medium").toUpperCase(),
      correctKey,
      q.explanation || null,
      source || "AI",
    ],
    conn,
  );
  const id = r.insertId;
  const values = q.options.map((text, i) => [id, letterFor(i), text]);
  await query(
    "INSERT INTO question_options (question_id, option_key, option_text) VALUES ?",
    [values],
    conn,
  );
  return id;
}

async function existsDuplicate(subjectId, text, conn, source = "AI") {
  return (
    (
      await query(
        "SELECT id FROM questions WHERE subject_id = ? AND UPPER(source_reference) = UPPER(?) AND LOWER(TRIM(question_text)) = LOWER(TRIM(?)) LIMIT 1",
        [subjectId, source, text],
        conn,
      )
    )[0] || null
  );
}
async function findById(id, includeAnswers = false, conn) {
  const rows = await query(
    "SELECT * FROM questions WHERE id = ? AND active = 1",
    [id],
    conn,
  );
  return (await hydrate(rows, includeAnswers, conn))[0] || null;
}
async function search(
  { subjectId, topicId, difficulty, search: s, limit, offset },
  includeAnswers = false,
) {
  const where = ["active = 1"];
  const p = [];
  if (subjectId) {
    where.push("subject_id = ?");
    p.push(subjectId);
  }
  if (topicId) {
    where.push("topic_id = ?");
    p.push(topicId);
  }
  if (difficulty && difficulty !== "mixed") {
    where.push("UPPER(difficulty) = ?");
    p.push(String(difficulty).toUpperCase());
  }
  if (s) {
    where.push("question_text LIKE ?");
    p.push(`%${s.replace(/[\\%_]/g, "\\$&")}%`);
  }
  const w = `WHERE ${where.join(" AND ")}`;
  const rows = await query(
    `SELECT * FROM questions ${w} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...p, limit, offset],
  );
  const [{ n }] = await query(`SELECT COUNT(*) AS n FROM questions ${w}`, p);
  return { items: await hydrate(rows, includeAnswers), total: Number(n) };
}
async function update(conn, id, { subjectId, topicId, q }) {
  await query(
    `UPDATE questions SET subject_id=?, topic_id=?, question_text=?, difficulty=?, correct_option_key=?, explanation=? WHERE id=?`,
    [
      subjectId,
      topicId || null,
      q.questionText,
      String(q.difficulty || "medium").toUpperCase(),
      letterFor(q.correctIndex),
      q.explanation || null,
      id,
    ],
    conn,
  );
  await query("DELETE FROM question_options WHERE question_id = ?", [id], conn);
  const values = q.options.map((text, i) => [id, letterFor(i), text]);
  await query(
    "INSERT INTO question_options (question_id, option_key, option_text) VALUES ?",
    [values],
    conn,
  );
}
const countInTests = async (id) =>
  Number(
    (
      await query(
        "SELECT COUNT(*) AS n FROM test_questions WHERE question_id = ?",
        [id],
      )
    )[0].n,
  );
const remove = (id) =>
  query("UPDATE questions SET active = 0 WHERE id = ?", [id]);
const setExplanation = (id, explanation) =>
  query("UPDATE questions SET explanation = ? WHERE id = ?", [explanation, id]);
async function pickMixedIds({
  userId,
  subjectId,
  topicIds,
  difficulty,
  count,
}) {
  const where = ["q.subject_id = ?", "q.active = 1"];
  const params = [subjectId];

  if (topicIds?.length) {
    where.push("q.topic_id IN (?)");
    params.push(topicIds);
  }

  if (difficulty && difficulty !== "mixed") {
    where.push("UPPER(q.difficulty) = ?");
    params.push(String(difficulty).toUpperCase());
  }

  const eligible = await query(
    `SELECT q.id,
      EXISTS (
        SELECT 1
        FROM test_questions tq
        JOIN test_attempts a ON a.test_id = tq.test_id
        WHERE tq.question_id = q.id
          AND a.user_id = ?
          AND UPPER(a.status) IN ('SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED')
      ) AS seen
     FROM questions q
     WHERE ${where.join(" AND ")}`,
    [userId, ...params],
  );

  const shuffle = (items) =>
    items
      .map((item) => ({ item, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map((entry) => entry.item);

  const unseen = shuffle(eligible.filter((q) => Number(q.seen) === 0));

  const seen = shuffle(eligible.filter((q) => Number(q.seen) === 1));

  // Aim for 70% new questions and 30% revision questions.
  const newTarget = Math.ceil(count * 0.7);
  const repeatTarget = count - newTarget;

  const selected = [
    ...unseen.slice(0, newTarget),
    ...seen.slice(0, repeatTarget),
  ];

  // Fill any remaining places if one group is too small.
  const selectedIds = new Set(selected.map((q) => Number(q.id)));

  const remaining = shuffle(
    eligible.filter((q) => !selectedIds.has(Number(q.id))),
  );

  selected.push(...remaining.slice(0, count - selected.length));

  return shuffle(selected).map((q) => Number(q.id));
}

async function pickRandomIds({ subjectId, topicIds, difficulty, count }) {
  const where = ["subject_id = ?", "active = 1"];
  const params = [subjectId];

  if (topicIds?.length) {
    where.push("topic_id IN (?)");
    params.push(topicIds);
  }

  if (difficulty && difficulty !== "mixed") {
    where.push("UPPER(difficulty) = ?");
    params.push(String(difficulty).toUpperCase());
  }

  const rows = await query(
    `SELECT id FROM questions
     WHERE ${where.join(" AND ")}
     ORDER BY RAND()
     LIMIT ?`,
    [...params, count],
  );

  return rows.map((row) => Number(row.id));
}
async function pickUnseenIds({ userId, subjectId, topicIds, difficulty }) {
  const where = [
    "q.subject_id = ?",
    "q.active = 1",
    `NOT EXISTS (
      SELECT 1
      FROM test_questions tq
      JOIN test_attempts a ON a.test_id = tq.test_id
      WHERE tq.question_id = q.id
        AND a.user_id = ?
        AND UPPER(a.status) IN ('SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED')
    )`,
  ];

  const params = [subjectId, userId];

  if (topicIds?.length) {
    where.push("q.topic_id IN (?)");
    params.push(topicIds);
  }

  if (difficulty && difficulty !== "mixed") {
    where.push("UPPER(q.difficulty) = ?");
    params.push(String(difficulty).toUpperCase());
  }

  const rows = await query(
    `SELECT q.id
     FROM questions q
     WHERE ${where.join(" AND ")}
     ORDER BY RAND()`,
    params,
  );

  return rows.map((row) => Number(row.id));
}
module.exports = {
  hydrate,
  insert,
  existsDuplicate,
  findById,
  search,
  update,
  countInTests,
  remove,
  setExplanation,
  pickRandomIds,
  pickMixedIds,
  pickUnseenIds,
};
