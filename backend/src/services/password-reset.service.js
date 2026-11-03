'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../config/database');
const users = require('../repositories/user.repository');
const { sendPasswordResetEmail } = require('./email.service');
const { config } = require('../config/environment');
const { E } = require('../utils/errors');

const TOKEN_TTL_MINUTES = 15;
const GENERIC_MESSAGE = 'If an account exists for that email address, a password reset link has been sent.';
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function requestReset(email) {
  // Configuration failures must be independent of whether the submitted address exists.
  if (!config.resend.apiKey || !config.resend.fromEmail) {
    throw E.unavailable('Password reset email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL on the backend.');
  }
  const user = await users.findByEmailWithHash(email);
  // Keep the response identical for unknown and inactive accounts.
  // Admin accounts share one centrally managed password; individual admin
  // password resets are disabled so the shared credential cannot diverge.
  if (!user || !user.is_active || String(user.role).toLowerCase() === 'admin') {
    return { message: GENERIC_MESSAGE };
  }

  const recent = await query(
    'SELECT COUNT(*) AS total FROM password_reset_tokens WHERE user_id = ? AND created_at >= (UTC_TIMESTAMP() - INTERVAL 1 HOUR)',
    [user.id],
  );
  if (Number(recent[0].total) >= 3) return { message: GENERIC_MESSAGE };

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  await query('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [user.id]);
  await query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))',
    [user.id, tokenHash, TOKEN_TTL_MINUTES],
  );

  const frontendBase = (config.frontendUrls[0] || 'http://127.0.0.1:5500').replace(/\/$/, '');
  const resetUrl = `${frontendBase}/reset-password.html?token=${encodeURIComponent(token)}`;
  try {
    await sendPasswordResetEmail({ to: user.email, resetUrl });
  } catch (err) {
    await query('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE token_hash = ?', [tokenHash]);
    console.error('[email] Password reset email delivery failed:', err.code || err.message);
    // Do not expose account existence through a provider-specific response. The generic
    // response is retained; operational delivery failures are recorded in server logs.
  }
  return { message: GENERIC_MESSAGE };
}

async function resetPassword({ token, password }) {
  const tokenHash = hashToken(token);
  const passwordHash = await bcrypt.hash(password, 12);
  await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT prt.id, prt.user_id FROM password_reset_tokens prt
       INNER JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = ? AND prt.used_at IS NULL
         AND prt.expires_at > UTC_TIMESTAMP() AND u.role = 'student'
       LIMIT 1 FOR UPDATE`,
      [tokenHash],
    );
    if (!rows.length) throw E.badRequest('This password reset link is invalid or has expired. Request a new link.');
    const reset = rows[0];
    const [updated] = await conn.query('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [passwordHash, reset.user_id]);
    if (!updated.affectedRows) throw E.badRequest('This password reset link is invalid or has expired. Request a new link.');
    await conn.query('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [reset.user_id]);
  });
  return { message: 'Your password has been reset successfully. You can now log in with your new password.' };
}

module.exports = { requestReset, resetPassword, TOKEN_TTL_MINUTES };
