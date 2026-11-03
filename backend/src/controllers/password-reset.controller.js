'use strict';
const service = require('../services/password-reset.service');
const { ok } = require('../utils/respond');
exports.request = async (req, res) => ok(res, await service.requestReset(req.body.email));
exports.reset = async (req, res) => ok(res, await service.resetPassword(req.body));
