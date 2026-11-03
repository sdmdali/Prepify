'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { phase, assertCanStart } = require('../../src/utils/exam-window');

const exam = {
  status: 'SCHEDULED',
  scheduled_start_at: '2026-10-30 12:00:00',
  scheduled_end_at: '2026-10-30 13:00:00',
};

test('scheduled exam remains upcoming before its exact start time', () => {
  assert.equal(phase(exam, new Date('2026-10-30T11:59:59.999Z')), 'upcoming');
  assert.throws(
    () => assertCanStart(exam, new Date('2026-10-30T11:59:59.999Z')),
    (error) => error.code === 'EXAM_NOT_STARTED'
  );
});

test('scheduled exam opens at its exact start time and ends at its end time', () => {
  assert.equal(phase(exam, new Date('2026-10-30T12:00:00.000Z')), 'open');
  assert.equal(assertCanStart(exam, new Date('2026-10-30T12:00:00.000Z')), true);
  assert.equal(phase(exam, new Date('2026-10-30T13:00:00.000Z')), 'ended');
});

test('cancelled and closed statuses cannot be started', () => {
  assert.equal(phase({ ...exam, status: 'CANCELLED' }), 'cancelled');
  assert.equal(phase({ ...exam, status: 'CLOSED' }), 'ended');
  assert.throws(() => assertCanStart({ ...exam, status: 'CANCELLED' }), (error) => error.code === 'EXAM_CANCELLED');
});

const { effectiveDeadline } = require('../../src/utils/deadline');

test('scheduled exam end caps a longer attempt duration', () => {
  assert.equal(
    effectiveDeadline('2026-10-30 13:30:00', '2026-10-30 13:00:00').toISOString(),
    '2026-10-30T13:00:00.000Z'
  );
});

test('shorter test duration remains the effective deadline', () => {
  assert.equal(
    effectiveDeadline('2026-10-30 12:45:00', '2026-10-30 13:00:00').toISOString(),
    '2026-10-30T12:45:00.000Z'
  );
});
