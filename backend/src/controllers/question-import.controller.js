'use strict';
const svc = require('../services/question.service');
const { ok } = require('../utils/respond');
exports.importQuestions = async (req, res) => ok(res, await svc.importRows(req.user, req.body));
