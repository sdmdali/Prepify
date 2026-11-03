'use strict';
const auth = require('../services/auth.service');
const { ok } = require('../utils/respond');
exports.register = async (req, res) => ok(res, await auth.register(req.body), 201);
exports.login = async (req, res) => ok(res, await auth.login(req.body));
// JWTs are stateless: there is no server-side session to destroy. The client must discard the token.
exports.logout = async (_req, res) => ok(res, { message: 'Logged out. Discard the token on the client; it remains valid until it expires.' });
exports.me = async (req, res) => ok(res, { user: { id: req.user.id, fullName: req.user.fullName, email: req.user.email, role: req.user.role } });
