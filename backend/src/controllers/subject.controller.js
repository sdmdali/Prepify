'use strict';
const svc = require('../services/catalog.service');
const { ok } = require('../utils/respond');
exports.list = async (_req, res) => ok(res, { items: await svc.listSubjects() });
exports.create = async (req, res) => ok(res, await svc.createSubject(req.body), 201);
exports.topics = async (req, res) => ok(res, { items: await svc.topicsFor(req.params.id) });
exports.createTopic = async (req, res) => ok(res, await svc.createTopic(req.params.id, req.body.name), 201);
