'use strict';
const rateLimit = require('express-rate-limit');
const { config } = require('../config/environment');

const json = (code, message) => (_req, res) =>
  res.status(429).json({ success: false, error: { code, message } });

const skip = () => config.isTest;
const general = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false, skip, handler: json('RATE_LIMITED', 'Too many requests. Please slow down.') });
const auth = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, skip, handler: json('AUTH_RATE_LIMITED', 'Too many authentication attempts. Try again later.') });
const passwordReset = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, skip, handler: json('PASSWORD_RESET_RATE_LIMITED', 'Too many password reset attempts. Try again later.') });
const ai = rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, skip, handler: json('AI_RATE_LIMITED', 'Too many AI requests. Try again in a minute.') });
module.exports = { general, auth, passwordReset, ai };
