'use strict';
const svc = require('../services/question.service');
const { ok } = require('../utils/respond');
exports.list = async (req, res) => ok(res, await svc.list(req.user, req.query));
exports.get = async (req, res) => ok(res, await svc.get(req.user, req.params.id));
exports.create = async (req, res) => ok(res, await svc.create(req.user, req.body), 201);
exports.update = async (req, res) => ok(res, await svc.update(req.params.id, req.body));
exports.remove = async (req, res) => { await svc.remove(req.params.id); res.status(204).end(); };
