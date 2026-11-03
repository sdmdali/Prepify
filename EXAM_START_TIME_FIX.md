# Scheduled Examination Start-Time Fix

## What changed

- Scheduled examination windows are checked on the backend before an attempt is created.
- The check uses the stored MySQL schedule as UTC and rejects attempts before `scheduled_start_at` with `EXAM_NOT_STARTED`.
- The exact start instant is allowed; the exact end instant is treated as ended.
- Cancelled and closed examinations cannot be started.
- The generic practice endpoint (`POST /tests/:id/attempts`) now refuses to start a test that belongs to a non-cancelled scheduled examination. Students must join with the exam code and use the examination start endpoint.
- The exam-specific endpoint rechecks the schedule and participant membership inside the attempt-creation transaction, so the frontend cannot bypass the rule.
- No database migration is required and no frontend redesign was made.

## Files changed

- `backend/src/repositories/exam.repository.js`
- `backend/src/services/attempt.service.js`
- `backend/src/services/exam.service.js`
- `backend/src/utils/exam-window.js` (new)
- `backend/tests/unit/exam-window.test.js` (new)

## Verification

- `node backend/scripts/verify-source.js` — passed (77 JavaScript files).
- `node --test backend/tests/unit/*.test.js` — passed (25/25 tests).
- Live MySQL and browser end-to-end testing were not available in this build environment. Verify with a newly scheduled future exam against the deployed database before considering the production fix fully confirmed.

## Deployment

No migration is required. Replace the existing backend source with this version, then run the project's normal install and start commands. Deploy the updated backend to Render. No frontend deployment is required for the server-side enforcement.
