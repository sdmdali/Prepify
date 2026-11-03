'use strict';
const catalog = require('../repositories/catalog.repository');
const { E } = require('../utils/errors');

async function createTopic(subjectId, name) {
  if (!(await catalog.getSubject(subjectId))) throw E.notFound('Subject not found');
  return catalog.createTopic(subjectId, name);
}
async function topicsFor(subjectId) {
  if (!(await catalog.getSubject(subjectId))) throw E.notFound('Subject not found');
  return catalog.listTopics(subjectId);
}
module.exports = { createTopic, topicsFor, listSubjects: catalog.listSubjects, createSubject: catalog.createSubject };
