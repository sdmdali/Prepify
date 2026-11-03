'use strict';
const { fromSql } = require('./time');
const { E } = require('./errors');

/** Interpret MySQL DATETIME values as UTC, matching the database connection config. */
function phase(exam, now = new Date()) {
  const status = String(exam?.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'closed' || status === 'ended') return 'ended';
  const startsAt = fromSql(exam.scheduled_start_at ?? exam.starts_at);
  const endsAt = fromSql(exam.scheduled_end_at ?? exam.ends_at);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    throw E.conflict('The examination schedule is invalid. Please contact the administrator.', 'EXAM_SCHEDULE_INVALID');
  }
  if (now < startsAt) return 'upcoming';
  if (now >= endsAt) return 'ended';
  return 'open';
}

function assertCanStart(exam, now = new Date()) {
  const currentPhase = phase(exam, now);
  if (currentPhase === 'cancelled') throw E.gone('This examination has been cancelled.', 'EXAM_CANCELLED');
  if (currentPhase === 'upcoming') {
    const startsAt = fromSql(exam.scheduled_start_at ?? exam.starts_at);
    throw E.conflict(`This examination has not started yet. It will be available at ${startsAt.toISOString()} (UTC).`, 'EXAM_NOT_STARTED');
  }
  if (currentPhase === 'ended') throw E.gone('This examination has ended.', 'EXAM_ENDED');
  return true;
}

module.exports = { phase, assertCanStart };
