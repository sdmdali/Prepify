'use strict';
const svc = require('../services/attempt.service');
const { ok } = require('../utils/respond');
exports.start = async (req, res) => { const r = await svc.start(req.user, req.params.id); ok(res, r, r.resumed ? 200 : 201); };
exports.get = async (req, res) => ok(res, await svc.getAttempt(req.user, req.params.id));
exports.submit = async (req, res) => ok(res, await svc.submit(req.user, req.params.id));
