'use strict';
const jwt = require('jsonwebtoken');
const { config } = require('../config/environment');
const { E } = require('../utils/errors');
const asyncHandler = require('../utils/asyncHandler');
const users = require('../repositories/user.repository');

function signToken(user) {
  // Only the id goes in the token; role is always re-read from the DB.
  return jwt.sign({ sub: String(user.id) }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn, algorithm: 'HS256',
  });
}

const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw E.unauthorized();
  let payload;
  try { payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] }); }
  catch { throw E.unauthorized('Invalid or expired token'); }
  const user = await users.findById(payload.sub);
  if (!user || !user.is_active) throw E.unauthorized('Account not found or disabled');
  req.user = { id: Number(user.id), role: user.role, email: user.email, fullName: user.full_name };
  next();
});

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(E.unauthorized());
  if (!roles.includes(req.user.role)) return next(E.forbidden());
  next();
};

module.exports = { signToken, authenticate, requireAdmin: requireRole('admin'), requireRole };
