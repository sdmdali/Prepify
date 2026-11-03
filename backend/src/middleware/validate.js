'use strict';
const { E } = require('../utils/errors');

/** validate({ body, query, params }) with zod schemas; replaces req parts with parsed values. */
module.exports = (schemas) => (req, _res, next) => {
  const issues = [];
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const r = schemas[part].safeParse(req[part] ?? {});
    if (!r.success) {
      r.error.issues.forEach((i) => issues.push({ in: part, field: i.path.join('.'), message: i.message }));
    } else if (part === 'query') {
      Object.defineProperty(req, 'query', { value: r.data, writable: true, configurable: true });
    } else req[part] = r.data;
  }
  if (issues.length) return next(E.validation(issues));
  next();
};
