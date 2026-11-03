'use strict';
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const E = {
  badRequest: (m = 'Bad request', d) => new AppError(400, 'BAD_REQUEST', m, d),
  validation: (d, m = 'Validation failed') => new AppError(422, 'VALIDATION_ERROR', m, d),
  unauthorized: (m = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', m),
  forbidden: (m = 'You do not have permission to do this') => new AppError(403, 'FORBIDDEN', m),
  notFound: (m = 'Resource not found') => new AppError(404, 'NOT_FOUND', m),
  conflict: (m = 'Conflict', code = 'CONFLICT') => new AppError(409, code, m),
  gone: (m = 'No longer available', code = 'GONE') => new AppError(410, code, m),
  tooMany: (m = 'Too many requests', code = 'RATE_LIMITED') => new AppError(429, code, m),
  unavailable: (m = 'Service unavailable', code = 'SERVICE_UNAVAILABLE') => new AppError(503, code, m),
  badGateway: (m = 'Upstream provider error', code = 'UPSTREAM_ERROR') => new AppError(502, code, m),
};
module.exports = { AppError, E };
