'use strict';
const { config } = require('../config/environment');
const gemini = require('../config/gemini');
const { E } = require('../utils/errors');
const { parseGeneratedQuestions, parseExplanation } = require('../utils/aiValidation');
const usage = require('../repositories/ai-usage.repository');

const SYSTEM = 'You write accurate multiple-choice exam questions for university students. ' +
  'Respond ONLY with JSON. Never include commentary. Each question has exactly one correct option.';

function mapProviderError(err) {
  if (err.code && String(err.code).startsWith('AI_')) return err;
  const status = Number(err.status || err.code || err?.error?.code);
  const msg = String(err.message || '');
  if (status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(msg)) return E.tooMany('AI provider quota exhausted. Try again later.', 'AI_QUOTA_EXCEEDED');
  if (status === 401 || status === 403 || /API key/i.test(msg)) return E.unavailable('AI provider rejected the configured credentials.', 'AI_AUTH_FAILED');
  if (status === 400 || status === 404) return E.badGateway('AI provider rejected the request or model.', 'AI_BAD_REQUEST');
  return E.badGateway('AI provider error.', 'AI_PROVIDER_ERROR');
}

async function callModel(prompt) {
  const client = gemini.getClient();
  if (!client) throw E.unavailable('AI is not configured. Set GEMINI_API_KEY on the server.', 'AI_NOT_CONFIGURED');
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'AI_TIMEOUT' })), config.ai.timeoutMs);
  });
  try {
    const resp = await Promise.race([
      client.models.generateContent({
        model: config.ai.model,
        contents: prompt,
        config: { systemInstruction: SYSTEM, responseMimeType: 'application/json', temperature: 0.4 },
      }),
      timeout,
    ]);
    const text = typeof resp?.text === 'function' ? resp.text() : resp?.text;
    if (!text) throw Object.assign(new Error('empty'), { code: 'AI_EMPTY_RESPONSE' });
    return text;
  } catch (err) {
    if (err.code === 'AI_TIMEOUT') throw E.badGateway('AI provider timed out.', 'AI_TIMEOUT');
    if (err.code === 'AI_EMPTY_RESPONSE') throw E.badGateway('AI provider returned an empty response.', 'AI_EMPTY_RESPONSE');
    throw mapProviderError(err);
  } finally { clearTimeout(timer); }
}

/** Enforces per-user daily limit, calls the model, and records usage (success or failure). */
async function tracked(userId, kind, metadata, fn) {
  if (!gemini.isConfigured()) throw E.unavailable('AI is not configured. Set GEMINI_API_KEY on the server.', 'AI_NOT_CONFIGURED');
  const used = await usage.countToday(userId);
  if (used >= config.ai.dailyLimit) throw E.tooMany(`Daily AI limit of ${config.ai.dailyLimit} requests reached.`, 'AI_DAILY_LIMIT');
  try {
    const out = await fn();
    await usage.record({ userId, model: config.ai.model, success: true, topic: metadata?.topic || (kind === 'generate_explanation' ? 'explanation' : 'general coverage of the subject'), difficulty: metadata?.difficulty || 'MEDIUM', count: metadata?.count || 10 });
    return out;
  } catch (err) {
    await usage.record({ userId, model: config.ai.model, success: false, errorCode: err.code || 'ERROR', topic: metadata?.topic || (kind === 'generate_explanation' ? 'explanation' : 'general coverage of the subject'), difficulty: metadata?.difficulty || 'MEDIUM', count: metadata?.count || 10 }).catch(() => {});
    throw err;
  }
}

function isSyllabusStructureQuestion(questionText) {
  const q = String(questionText || '').toLowerCase();
  return /\b(which|what)\s+(unit|chapter|module|section|part)\b/.test(q) ||
    /\b(which|what)\s+(unit|chapter|module|section|part)\s+(contains|includes|covers|consists of|has)\b/.test(q) ||
    /\b(unit|chapter|module|section)\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x|\d+)\b/.test(q) &&
      /\b(contains|includes|covers|consists of|topics|syllabus)\b/.test(q) ||
    /\baccording to the syllabus\b|\bmentioned in unit\b|\blisted under unit\b/.test(q);
}

async function generateQuestions(userId, { subjectName, topic, syllabusText, difficulty, count }) {
  return tracked(userId, 'generate_questions', { topic: topic || subjectName, difficulty, count }, async () => {
    // A supplied topic must remain an explicit constraint even when PDF text is present.
    // Previously the syllabusText branch replaced the topic instruction entirely, so the
    // model received the PDF but could ignore the user's requested focus.
    const source = [
      syllabusText
        ? `SOURCE MATERIAL (use this to identify academic concepts, not to ask about document structure):\n"""\n${syllabusText}\n"""`
        : '',
      topic
        ? `MANDATORY FOCUS TOPIC: ${topic}. Every generated question must directly test this topic, as it appears in the source material. Treat the topic as a strict filter, not a suggestion. Do not generate broad subject questions or questions about adjacent topics. If the topic is not substantively covered in the source, do not substitute another topic; report that there is insufficient relevant material.`
        : (!syllabusText ? 'TOPIC SCOPE: general coverage of the selected subject.' : 'TOPIC SCOPE: cover the academic concepts throughout the uploaded source material.')
    ].filter(Boolean).join('\n\n');

    const makePrompt = (amount, rejected = []) =>
      `Subject: ${subjectName}\n${source}\nDifficulty: ${difficulty}\nWrite exactly ${amount} multiple-choice questions.\n` +
      `CRITICAL EDUCATIONAL QUALITY RULES:\n` +
      `- Test the learner's understanding of academic concepts, definitions, principles, applications, code, calculations, and problem-solving found in the source.\n` +
      `- Unit/chapter/module headings are organizational labels only. Never ask which unit/chapter contains a topic, what a unit covers, what topics are listed in a unit, or any question about where information appears in the document.\n` +
      `- Do not ask document-navigation, syllabus-recall, administrative, or meta questions.\n` +
      `- If the PDF only names a concept without explaining it, write a standard academic question about that named concept; do not turn the unit heading into a question.\n` +
      `- Every question must be answerable as a subject-knowledge question without needing to look at the PDF's page or unit numbering.\n` +
      (topic ? `- TOPIC LOCK: explicitly test only \"${topic}\". Each question must require knowledge of that topic; merely mentioning the topic in the stem is not enough. Reject questions that are only generally about the subject.\n` : '') +
      (rejected.length ? `- Do not repeat or paraphrase these rejected questions: ${JSON.stringify(rejected)}\n` : '') +
      'Return JSON only: {"questions":[{"question":string,"options":[string,string,string,string],"correctIndex":number (0-3),"difficulty":"easy"|"medium"|"hard","explanation":string}]}';

    const all = [];
    const seen = new Set();
    const rejected = [];
    // Retry once when the model returns document-structure questions or too few valid items.
    for (let pass = 0; pass < 2 && all.length < count; pass++) {
      const remaining = count - all.length;
      const text = await callModel(makePrompt(remaining, rejected));
      const parsed = parseGeneratedQuestions(text, { expectedDifficulty: difficulty });
      if (parsed.parseError) {
        if (pass === 0) continue;
        throw E.badGateway(parsed.parseError, 'AI_INVALID_RESPONSE');
      }
      for (const q of parsed.valid) {
        if (syllabusText && isSyllabusStructureQuestion(q.questionText)) {
          rejected.push(q.questionText);
          continue;
        }
        const key = q.questionText.toLowerCase().replace(/\s+/g, ' ').trim();
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(q);
        if (all.length >= count) break;
      }
    }
    if (all.length === 0) throw E.badGateway('AI returned no usable academic questions. Try a clearer, text-based syllabus PDF.', 'AI_INVALID_RESPONSE');
    if (all.length < count) throw E.badGateway(`AI produced only ${all.length} suitable questions out of ${count} requested. Try again or upload a more detailed syllabus.`, 'AI_INSUFFICIENT_QUESTIONS');
    return { questions: all.slice(0, count), rejectedCount: rejected.length, requested: count };
  });
}

async function generateExplanation(userId, question) {
  return tracked(userId, 'generate_explanation', { topic: 'explanation', difficulty: 'MEDIUM', count: 10 }, async () => {
    const opts = question.options.map((o, i) => `${i}. ${o.text}`).join('\n');
    const correct = question.options.find((o) => o.isCorrect);
    const prompt = `Question: ${question.questionText}\nOptions:\n${opts}\nCorrect option: ${correct.text}\n` +
      'Explain concisely why the correct option is right. Return JSON: {"explanation":string}';
    const text = await callModel(prompt);
    const explanation = parseExplanation(text);
    if (!explanation) throw E.badGateway('AI returned an unusable explanation.', 'AI_INVALID_RESPONSE');
    return { explanation };
  });
}
module.exports = { generateQuestions, generateExplanation };
