'use strict';
const path = require('path');
// dotenv's parser keeps quoted values (including spaces) exactly as written.
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const env = process.env;

const config = {
  nodeEnv: env.NODE_ENV || 'development',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT) || 8080,
  db: {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT) || 3306,
    database: env.DB_NAME || 'prepify',
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD ?? '', // never trimmed
  },
  frontendUrls: (env.FRONTEND_URL || 'http://127.0.0.1:5500')
    .split(',').map((s) => s.trim()).filter(Boolean),
  jwt: { secret: env.JWT_SECRET || '', expiresIn: env.JWT_EXPIRES_IN || '1d' },
  // All admin accounts authenticate with this one shared bcrypt hash.
  // Individual users.password_hash values are intentionally ignored for admins.
  admin: { sharedPasswordHash: env.ADMIN_SHARED_PASSWORD_HASH || '' },
  resend: {
    apiKey: env.RESEND_API_KEY || '',
    fromEmail: env.RESEND_FROM_EMAIL || '',
  },
  ai: {
    provider: env.AI_PROVIDER || 'gemini',
    apiKey: env.GEMINI_API_KEY || '',
    model: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    dailyLimit: Number(env.AI_DAILY_LIMIT) || 20,
    timeoutMs: Math.max(10000, Number(env.AI_TIMEOUT_MS) || 90000),
  },
};

function assertStartupConfig() {
  const s = config.jwt.secret;
  if (!s || s.length < 32 || s.startsWith('replace_with')) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters.');
  }
}

module.exports = { config, assertStartupConfig };
