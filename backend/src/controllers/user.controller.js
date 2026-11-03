'use strict';
const users = require('../repositories/user.repository');
const { auth } = { auth: require('../services/auth.service') };
const { ok } = require('../utils/respond');
exports.profile = async (req, res) => ok(res, { user: auth.present(await users.findById(req.user.id)) });
