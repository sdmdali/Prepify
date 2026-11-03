# Prepify – exam timing and test-window integrity update

This update builds on the previous exam-start-time fix.

## Included

- A scheduled examination's effective deadline is the earlier of its own test duration and the scheduled examination end time.
- The server checks that deadline when answers are saved, attempts are fetched, and submissions are finalized. The scheduled end time therefore cannot be extended by changing the browser clock or session storage.
- New scheduled-exam attempts are linked to their `exam_session_id` in `test_attempts`. Older in-progress attempts without that link are resolved by their test ID for deadline enforcement.
- The same active test page is used for mock/practice tests and college examinations, so the same integrity controls apply to both.
- Switching to another browser tab or hiding/minimizing the test page triggers automatic submission. The result page explains why the attempt was submitted.
- Browser back navigation, in-page navigation links, common back keyboard shortcuts, and accidental page unload are guarded while an attempt is active.

## Important browser limitation

A normal website cannot disable the browser's tab strip, operating-system app switching, address bar, or force a browser to remain on one tab. This implementation detects the page becoming hidden and auto-submits the attempt. A user can still switch away momentarily, but cannot continue the attempt after the page is hidden and the auto-submit request is processed. This is a browser-side integrity measure, not a full secure/proctored-browser environment.

## Deployment

- No new database migration is included.
- Deploy the updated backend to Render and the updated frontend to Vercel (the frontend JavaScript changed).
- Restart the backend after deployment.
- Test both a mock test and a scheduled college examination.

## Verification performed

- JavaScript syntax checks: passed for all project JavaScript files.
- Backend source verification: passed (78 JavaScript files).
- Backend unit tests: 27/27 passed.
- Live MySQL, Render/Vercel, and browser end-to-end verification: not available in this build environment; verify after deployment.
