'use strict';
const { query } = require('../config/database');
async function countToday(userId) {
  const [row] = await query('SELECT COUNT(*) AS n FROM ai_generation_usage WHERE user_id = ? AND created_at >= UTC_DATE()', [userId]);
  return Number(row.n);
}
async function record({ userId, model = null, success, errorCode = null, topic = 'general coverage of the subject', difficulty = 'MEDIUM', count = 10, providerName = 'gemini' }) {
  // Existing DB constraint accepts only these count values and uppercase difficulty/status values.
  const allowedCounts = [10, 20, 30, 50];
  const rawCount = Number(count) || 10;
  const requestedCount = allowedCounts.includes(rawCount) ? rawCount : allowedCounts.reduce((best, n) => Math.abs(n - rawCount) < Math.abs(best - rawCount) ? n : best, 10);
  const d = String(difficulty || 'MEDIUM').toUpperCase();
  const requestedDifficulty = ['EASY', 'MEDIUM', 'HARD'].includes(d) ? d : 'MEDIUM';
  await query(
    `INSERT INTO ai_generation_usage (user_id, requested_topic, requested_difficulty, requested_count, status, provider_name, model_name, completed_at, failure_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), ?)`,
    [userId, String(topic || 'general coverage of the subject').slice(0, 255), requestedDifficulty, requestedCount, success ? 'SUCCEEDED' : 'FAILED', providerName, model, success ? null : String(errorCode || 'ERROR').slice(0, 80)]
  );
}
module.exports = { countToday, record };
