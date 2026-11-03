'use strict';
const { fromSql } = require('./time');

/** Return the earlier of an attempt deadline and an optional scheduled exam end. */
function effectiveDeadline(attemptDeadline, scheduledEnd = null) {
  const attempt = fromSql(attemptDeadline);
  if (!scheduledEnd) return attempt;
  const examEnd = fromSql(scheduledEnd);
  if (!Number.isFinite(examEnd.getTime())) return attempt;
  return examEnd < attempt ? examEnd : attempt;
}

module.exports = { effectiveDeadline };
