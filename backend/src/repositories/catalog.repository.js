"use strict";

const { query } = require("../config/database");

// Subjects
const listSubjects = () => query("SELECT id, name FROM subjects ORDER BY name");

const getSubject = async (id) =>
  (await query("SELECT id, name FROM subjects WHERE id = ?", [id]))[0] || null;

const getSubjectBySlug = async (slug, conn) =>
  (
    await query(
      "SELECT id, slug, name FROM subjects WHERE slug = ?",
      [slug],
      conn,
    )
  )[0] || null;

async function createSubject({ slug, name }) {
  const result = await query(
    "INSERT INTO subjects (slug, name) VALUES (?, ?)",
    [slug, name],
  );

  return getSubject(result.insertId);
}

// Topics
const listTopics = (subjectId) =>
  query(
    "SELECT id, subject_id AS subjectId, name FROM topics WHERE subject_id = ? ORDER BY name",
    [subjectId],
  );

const getTopic = async (id) =>
  (
    await query(
      "SELECT id, subject_id AS subjectId, name FROM topics WHERE id = ?",
      [id],
    )
  )[0] || null;

const getTopicByName = async (subjectId, name, conn) =>
  (
    await query(
      "SELECT id, subject_id AS subjectId, name FROM topics WHERE subject_id = ? AND name = ?",
      [subjectId, name],
      conn,
    )
  )[0] || null;

async function createTopic(subjectId, name) {
  const result = await query(
    "INSERT INTO topics (subject_id, name) VALUES (?, ?)",
    [subjectId, name],
  );

  return getTopic(result.insertId);
}

module.exports = {
  listSubjects,
  getSubject,
  getSubjectBySlug,
  createSubject,
  listTopics,
  getTopic,
  getTopicByName,
  createTopic,
};
