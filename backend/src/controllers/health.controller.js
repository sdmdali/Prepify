'use strict';
const { query } = require('../config/database');
const gemini = require('../config/gemini');
const { config } = require('../config/environment');

exports.health = async (_req, res) => {
  let db = 'up';
  try { await query('SELECT 1'); } catch { db = 'down'; }
  const body = { status: db === 'up' ? 'ok' : 'degraded', database: db, ai: gemini.isConfigured() ? 'configured' : 'not_configured', environment: config.nodeEnv, time: new Date().toISOString() };
  res.status(db === 'up' ? 200 : 503).json({ success: db === 'up', data: body });
};
