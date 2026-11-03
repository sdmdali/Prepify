'use strict';
const svc = require('../services/attempt.service');
const { ok } = require('../utils/respond');
exports.saveOne = async (req, res) => ok(res, await svc.saveAnswers(req.user, req.params.id, [req.body]));
exports.saveMany = async (req, res) => ok(res, await svc.saveAnswers(req.user, req.params.id, req.body.answers));
