'use strict';
const { AppError } = require('../utils/errors');
const { config } = require('../config/environment');

function notFound(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} not found`));
}

// Never leaks stack traces, SQL, or credentials in responses.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.parse.failed') err = new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  if (err.type === 'entity.too.large') err = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  if (err.code === 'ER_DUP_ENTRY') err = new AppError(409, 'DUPLICATE', 'A record with these values already exists');
  if (err.code === 'ER_NO_REFERENCED_ROW_2') err = new AppError(422, 'INVALID_REFERENCE', 'Referenced record does not exist');
  if (err.code === 'ER_ROW_IS_REFERENCED_2') err = new AppError(409, 'IN_USE', 'Record is in use and cannot be removed');
  if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(err.code)) {
    console.error('[db]', err.code); // code only, never connection details
    err = new AppError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable');
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }
  if (!config.isTest) console.error('[error]', req.method, req.originalUrl, err.code || '', err.message);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error', ...(config.isProd ? {} : { debug: err.message }) },
  });
}
module.exports = { notFound, errorHandler };
