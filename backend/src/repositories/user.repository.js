'use strict';
const { query } = require('../config/database');

const PUBLIC = 'id, full_name, email, role, is_active, created_at';
const findById = async (id) => (await query(`SELECT ${PUBLIC} FROM users WHERE id = ?`, [id]))[0] || null;
const findByEmailWithHash = async (email) => (await query('SELECT * FROM users WHERE email = ?', [email]))[0] || null;
async function create({ fullName, email, passwordHash }) {
  // role is never taken from the client: new accounts are always students.
  const r = await query('INSERT INTO users (full_name, email, password_hash, role) VALUES (?,?,?,\'student\')', [fullName, email, passwordHash]);
  return findById(r.insertId);
}
async function list({ limit, offset }) {
  const rows = await query(`SELECT ${PUBLIC} FROM users ORDER BY id DESC LIMIT ? OFFSET ?`, [limit, offset]);
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM users');
  return { rows, total: Number(n) };
}
async function setRole(id, role) { await query('UPDATE users SET role = ? WHERE id = ?', [role, id]); return findById(id); }
async function setActive(id, active) { await query('UPDATE users SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]); return findById(id); }
module.exports = { findById, findByEmailWithHash, create, list, setRole, setActive };
