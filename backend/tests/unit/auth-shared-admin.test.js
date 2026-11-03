'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const users = require('../../src/repositories/user.repository');
const { config } = require('../../src/config/environment');
const auth = require('../../src/services/auth.service');

test('admin login uses the one shared password and ignores per-account password hashes', async () => {
  const oldFind = users.findByEmailWithHash;
  const oldHash = config.admin.sharedPasswordHash;
  const oldJwt = config.jwt.secret;
  const sharedPassword = 'Prepify-Shared-Admin-Password!';
  const sharedHash = await bcrypt.hash(sharedPassword, 4);
  config.admin.sharedPasswordHash = sharedHash;
  config.jwt.secret = 'unit-test-secret-that-is-at-least-32-characters-long';
  users.findByEmailWithHash = async () => ({
    id: 71, full_name: 'Admin One', email: 'admin1@example.com', role: 'admin',
    is_active: 1, created_at: '2026-01-01',
    password_hash: await bcrypt.hash('old-individual-admin-password', 4),
  });
  try {
    const result = await auth.login({ email: 'admin1@example.com', password: sharedPassword });
    assert.equal(result.user.role, 'admin');
    assert.ok(result.token);
    await assert.rejects(
      auth.login({ email: 'admin1@example.com', password: 'old-individual-admin-password' }),
      (error) => error.status === 401,
    );
  } finally {
    users.findByEmailWithHash = oldFind;
    config.admin.sharedPasswordHash = oldHash;
    config.jwt.secret = oldJwt;
  }
});

test('admin login is blocked when shared admin password hash is not configured', async () => {
  const oldFind = users.findByEmailWithHash;
  const oldHash = config.admin.sharedPasswordHash;
  users.findByEmailWithHash = async () => ({
    id: 72, full_name: 'Admin Two', email: 'admin2@example.com', role: 'admin',
    is_active: 1, password_hash: '$2a$10$unused',
  });
  config.admin.sharedPasswordHash = '';
  try {
    await assert.rejects(
      auth.login({ email: 'admin2@example.com', password: 'anything' }),
      (error) => error.status === 503,
    );
  } finally {
    users.findByEmailWithHash = oldFind;
    config.admin.sharedPasswordHash = oldHash;
  }
});
