'use strict';
const { config } = require('../config/environment');

async function sendPasswordResetEmail({ to, resetUrl }) {
  if (!config.resend.apiKey || !config.resend.fromEmail) {
    const err = new Error('Password reset email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resend.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.resend.fromEmail,
      to: [to],
      subject: 'Reset your Prepify password',
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#333"><h2>Reset your Prepify password</h2><p>We received a request to reset the password for your Prepify account.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#A76572;color:#fff;text-decoration:none;border-radius:8px">Reset password</a></p><p>This link expires in 15 minutes and can only be used once.</p><p>If you did not request this, you can safely ignore this email.</p><p>— Prepify</p></div>`,
      text: `Reset your Prepify password using this link: ${resetUrl}\n\nThis link expires in 15 minutes and can only be used once. If you did not request this, ignore this email.`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const err = new Error(`Resend rejected the email (${response.status}): ${detail.slice(0, 300)}`);
    err.code = 'EMAIL_PROVIDER_ERROR';
    throw err;
  }
  return response.json();
}
module.exports = { sendPasswordResetEmail };
