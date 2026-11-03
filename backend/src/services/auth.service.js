'use strict';
const bcrypt = require('bcryptjs');
const users = require('../repositories/user.repository');
const { signToken } = require('../middleware/auth');
const { E } = require('../utils/errors');
const { config } = require('../config/environment');

const COST = 12;
// Pre-computed hash so login takes similar time whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

const present = (u) => ({ id: Number(u.id), fullName: u.full_name, email: u.email, role: u.role, createdAt: u.created_at });

async function register({ fullName, email, password }) {
  if (await users.findByEmailWithHash(email)) throw E.conflict('An account with this email already exists', 'EMAIL_TAKEN');
  const passwordHash = await bcrypt.hash(password, COST);
  let user;
  try { user = await users.create({ fullName, email, passwordHash }); }
  catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw E.conflict('An account with this email already exists', 'EMAIL_TAKEN');
    throw err;
  }
  return { user: present(user), token: signToken(user) };
}

async function login({ email, password }) {
  const row = await users.findByEmailWithHash(email);
  if (!row || !row.is_active) {
    // Keep the same approximate password-hash work for unknown/inactive accounts.
    await bcrypt.compare(password, DUMMY_HASH);
    throw E.unauthorized('Invalid email or password');
  }

  let ok;
  if (String(row.role).toLowerCase() === 'admin') {
    // Every admin account uses one centrally configured password. The per-row
    // password_hash is deliberately not used for admin authentication.
    if (!config.admin.sharedPasswordHash) {
      throw E.unavailable('Admin login is not configured. Set ADMIN_SHARED_PASSWORD_HASH on the backend.');
    }
    ok = await bcrypt.compare(password, config.admin.sharedPasswordHash);
  } else {
    ok = await bcrypt.compare(password, row.password_hash || DUMMY_HASH);
  }

  if (!ok) throw E.unauthorized('Invalid email or password');
  return { user: present(row), token: signToken(row) };
}
module.exports = { register, login, present };
