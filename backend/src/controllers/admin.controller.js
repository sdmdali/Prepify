'use strict';
const users = require('../repositories/user.repository');
const auth = require('../services/auth.service');
const { query } = require('../config/database');
const { E } = require('../utils/errors');
const { ok } = require('../utils/respond');

exports.listUsers = async (req, res) => {
  const { page, limit } = req.query;
  const { rows, total } = await users.list({ limit, offset: (page - 1) * limit });
  ok(res, { items: rows.map(auth.present), page, limit, total });
};
exports.setRole = async (req, res) => {
  if (req.params.id === req.user.id) throw E.forbidden('You cannot change your own role');
  if (!(await users.findById(req.params.id))) throw E.notFound('User not found');
  ok(res, { user: auth.present(await users.setRole(req.params.id, req.body.role)) });
};
exports.setActive = async (req, res) => {
  if (req.params.id === req.user.id) throw E.forbidden('You cannot deactivate your own account');
  if (!(await users.findById(req.params.id))) throw E.notFound('User not found');
  ok(res, { user: auth.present(await users.setActive(req.params.id, req.body.isActive)) });
};
exports.stats = async (_req, res) => {
  const [u] = await query('SELECT COUNT(*) AS n FROM users');
  const [q] = await query('SELECT COUNT(*) AS n FROM questions');
  const [t] = await query('SELECT COUNT(*) AS n FROM tests');
  const [a] = await query("SELECT COUNT(*) AS n FROM test_attempts WHERE status <> 'in_progress'");
  ok(res, { users: Number(u.n), questions: Number(q.n), tests: Number(t.n), completedAttempts: Number(a.n) });
};
