# Prepify integration status — updated build

## What is connected in this build
- Registration and login call the backend and store the returned token/user.
- Practice setup loads subject IDs from the API, creates a practice test, and starts an attempt.
- The test page renders API-returned questions/options, saves answer selections to the backend, submits the attempt, and opens the results page.
- Results are loaded from the backend.
- Dashboard stats and test history load from result/history endpoints.
- Question bank loads questions from the API with search, subject and difficulty filters.
- Exam joining calls the API and starts an attempt when the exam window is open.
- Admin dashboard loads summary information; full admin content-management controls remain limited.

## Safe demo database
The existing `prepify` database has a different schema from this backend. Do not run the initial migration against that database. Use `npm.cmd run setup:demo` to create an isolated `prepify_demo` database, apply the backend's schema, and seed 20 sample Computer Science questions. The setup script does not drop or migrate the existing `prepify` database.

The sample question bank is for demonstrating the user journey; it is not the full 3,300-question bank. Syllabus PDF upload and AI question generation still require their respective backend/API support and configuration.

## Verification boundary
- Static JavaScript syntax check: run `npm.cmd run verify:source`.
- Unit tests: run `npm.cmd run test:unit`.
- MySQL-backed API integration suite: run `npm.cmd run test:integration` after `npm.cmd run setup:demo`.
- A true browser-to-MySQL end-to-end demonstration must run on a machine with MySQL and the configured `.env`. This authoring environment cannot connect to the user's local MySQL instance, so no claim is made that their local live database/browser run has already passed.

## AI-only test generation update
- Practice generation now always requests the full question set from Gemini and attaches those exact generated question IDs to the test. It does not fill tests with random pre-existing question-bank records.
- Subject-only practice uses general subject coverage. PDF-only practice uses the PDF concepts. PDF + topic passes the PDF and topic as simultaneous constraints. Topic text is not used as a topic-only filter for subject-only practice.
- Admin dashboard now includes an AI-powered college exam creation form. It generates and stores a paper once, publishes a test snapshot, schedules one exam session, and returns a join code. All students joining that exam use the same published question snapshots.
- Bulk question import is not required. Generated questions are still persisted in MySQL for the question-bank view, exam snapshots, answer keys, and results.
- Verification in this build: source syntax check passed for 71 JavaScript files; 20 unit tests passed. Gemini and MySQL end-to-end behaviour must still be tested with the user's configured `.env` and local database.
