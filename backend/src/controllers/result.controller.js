'use strict';
const svc = require('../services/attempt.service');
const { ok } = require('../utils/respond');
exports.history = async (req, res) => ok(res, await svc.history(req.user, req.query));
exports.get = async (req, res) => ok(res, await svc.getResult(req.user, req.params.id));
