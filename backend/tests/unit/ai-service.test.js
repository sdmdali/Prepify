'use strict';
// Runs without installed dependencies: third-party modules and the DB-backed usage repo are stubbed,
// and Gemini is replaced by a fake client. Exercises the real src/services/ai.service.js logic.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'dotenv') return { config() {} };
  if (request === 'mysql2/promise') return { createPool() { throw new Error('DB must not be used in this test'); } };
  return origLoad.call(this, request, parent, isMain);
};

process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = '';
process.env.AI_DAILY_LIMIT = '2';

// Replace usage repository with an in-memory fake before the service loads it.
const usageLog = [];
const usagePath = require.resolve('../../src/repositories/ai-usage.repository');
require.cache[usagePath] = { id: usagePath, filename: usagePath, loaded: true, exports: {
  countToday: async () => usageLog.length,
  record: async (r) => { usageLog.push(r); },
} };

const gemini = require('../../src/config/gemini');
const ai = require('../../src/services/ai.service');

const goodJson = JSON.stringify({ questions: [
  { question: 'What does LIFO stand for?', options: ['Last in first out', 'Fast in fast out'], correctIndex: 0, explanation: 'Stack order.' },
] });

function fakeClient(impl) { return () => ({ models: { generateContent: impl } }); }
const reset = () => { usageLog.length = 0; gemini.setClientFactory(null); };
const args = { subjectName: 'Data Structures', topic: 'Stacks', difficulty: 'easy', count: 1 };

test('missing API key -> AI_NOT_CONFIGURED (503), nothing recorded, no fabricated output', async () => {
  reset();
  await assert.rejects(() => ai.generateQuestions(1, args), (e) => e.status === 503 && e.code === 'AI_NOT_CONFIGURED');
  assert.equal(usageLog.length, 0);
});

test('valid model response is parsed, validated and usage recorded', async () => {
  reset();
  gemini.setClientFactory(fakeClient(async () => ({ text: goodJson })));
  const out = await ai.generateQuestions(1, args);
  assert.equal(out.questions.length, 1);
  assert.equal(out.questions[0].difficulty, 'easy');
  assert.equal(usageLog.length, 1); assert.equal(usageLog[0].success, true);
});

test('non-JSON response -> AI_INVALID_RESPONSE (502) and failure recorded', async () => {
  reset();
  gemini.setClientFactory(fakeClient(async () => ({ text: 'Sorry, I cannot do that' })));
  await assert.rejects(() => ai.generateQuestions(1, args), (e) => e.status === 502 && e.code === 'AI_INVALID_RESPONSE');
  assert.equal(usageLog[0].success, false);
});

test('all questions invalid -> rejected, nothing returned', async () => {
  reset();
  const bad = JSON.stringify({ questions: [{ question: 'x', options: ['a'], correctIndex: 9 }] });
  gemini.setClientFactory(fakeClient(async () => ({ text: bad })));
  await assert.rejects(() => ai.generateQuestions(1, args), (e) => e.code === 'AI_INVALID_RESPONSE');
});

test('provider quota error (429) -> AI_QUOTA_EXCEEDED', async () => {
  reset();
  gemini.setClientFactory(fakeClient(async () => { throw Object.assign(new Error('RESOURCE_EXHAUSTED quota'), { status: 429 }); }));
  await assert.rejects(() => ai.generateQuestions(1, args), (e) => e.status === 429 && e.code === 'AI_QUOTA_EXCEEDED');
});

test('provider auth error -> AI_AUTH_FAILED; unknown error -> AI_PROVIDER_ERROR', async () => {
  reset();
  gemini.setClientFactory(fakeClient(async () => { throw Object.assign(new Error('API key not valid'), { status: 403 }); }));
  await assert.rejects(() => ai.generateQuestions(1, args), (e) => e.code === 'AI_AUTH_FAILED');
  gemini.setClientFactory(fakeClient(async () => { throw new Error('boom'); }));
  await assert.rejects(() => ai.generateQuestions(1, args), (e) => e.code === 'AI_PROVIDER_ERROR');
});

test('daily limit enforced before calling the provider', async () => {
  reset();
  let calls = 0;
  gemini.setClientFactory(fakeClient(async () => { calls++; return { text: goodJson }; }));
  await ai.generateQuestions(1, args); await ai.generateQuestions(1, args);
  await assert.rejects(() => ai.generateQuestions(1, args), (e) => e.status === 429 && e.code === 'AI_DAILY_LIMIT');
  assert.equal(calls, 2);
});

test('explanation generation validates output', async () => {
  reset();
  const q = { questionText: 'What is LIFO?', options: [{ text: 'Last in first out', isCorrect: true }, { text: 'x', isCorrect: false }] };
  gemini.setClientFactory(fakeClient(async () => ({ text: '{"explanation":"Last item added is removed first."}' })));
  assert.equal((await ai.generateExplanation(1, q)).explanation, 'Last item added is removed first.');
  gemini.setClientFactory(fakeClient(async () => ({ text: '{"explanation":""}' })));
  await assert.rejects(() => ai.generateExplanation(1, q), (e) => e.code === 'AI_INVALID_RESPONSE');
});
