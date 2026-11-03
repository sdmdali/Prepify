# Prepify Backend

Node.js · Express · MySQL (`mysql2`) · Google Gemini (`@google/genai`) · JWT auth · Zod validation.

## Verification status (read this first)

This code was written and checked in a sandbox **without npm registry access and without MySQL**. Therefore:

| Check | Status |
|---|---|
| Syntax of every file (`node --check`) | Ran, passed |
| All 139 relative `require()` paths resolve; all 44 routes map to real controller exports; all 32 controller→service calls exist | Ran, passed |
| 20 unit tests (`node --test tests/unit/*.test.js`): scoring, question validation, CSV parser, import row mapping, AI output validation, duplicate hashing, time helpers, and the real `ai.service.js` with a fake Gemini client (missing key, invalid JSON, quota, auth error, daily limit) | Ran, **20 passed, 0 failed, 0 skipped** |
| Frontend SHA-256 checksums before/after | Ran, unchanged (see report) |
| `npm install`, `package-lock.json` | **Not run** (no network). Run `npm install` to create the lockfile. |
| Server startup, HTTP routes, SQL statements, migrations against MySQL, bcrypt/JWT/Helmet/CORS/rate-limit behaviour | **Not executed** |
| Jest + Supertest integration suite (`tests/integration/api.test.js`, ~15 tests covering auth, roles, questions, import, tests, attempts, scoring, duplicate submits, concurrency, timeouts, exams, AI mock, CORS) | Written, **not executed**; needs a separate MySQL test DB |
| Real Gemini call | **Not executed** (no key, no network) |

Expect to find and fix small defects when you first run it against your real database. Run `npm run db:inspect` first.

## Setup

```powershell
cd backend
npm.cmd install
```

The ZIP does **not** contain `.env` (it holds secrets). Create it from the separate `backend.env.txt` download (your MySQL settings plus a generated `JWT_SECRET`), saved as `backend\.env`; or copy `.env.example` to `.env` and fill it in.
Keep quotes around a password containing spaces (`DB_PASSWORD="…"`); dotenv does not trim quoted values. `.env` is git-ignored.
To regenerate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

| Variable | Purpose |
|---|---|
| `PORT` | default 8080 |
| `DB_HOST/PORT/NAME/USER/PASSWORD` | MySQL |
| `FRONTEND_URL` | CORS allow-list, comma-separated. `127.0.0.1` and `localhost` variants are both allowed |
| `JWT_SECRET` | ≥32 chars, server refuses to start otherwise |
| `JWT_EXPIRES_IN` | e.g. `1d` |
| `ADMIN_SHARED_PASSWORD_HASH` | bcrypt hash of the single password shared by every admin account; required for admin login |
| `GEMINI_API_KEY` | optional; AI endpoints return 503 `AI_NOT_CONFIGURED` when empty |
| `GEMINI_MODEL` | default `gemini-2.5-flash` when empty (verify availability in Google AI Studio; model names change) |
| `AI_DAILY_LIMIT` | AI requests per user per UTC day (default 20) |
| `RESEND_API_KEY` | Resend API key used for password-reset emails |
| `RESEND_FROM_EMAIL` | Sender address verified in Resend (testing sender is restricted to permitted recipients) |

## Database safety

* Nothing here drops, truncates, recreates or syncs your `prepify` database.
* `npm run db:inspect` (read-only) prints your real tables/columns and flags anything the API expects but does not find.
* `npm run db:migrate` runs `database/migrations/*.sql` once each, tracked in `schema_migrations`. Migrations use
  `CREATE TABLE IF NOT EXISTS` only; the runner also refuses any migration containing `DROP`/`TRUNCATE`/`DELETE FROM`.
* **No schema was supplied** in the ZIP (no migrations, no SQL), and I could not reach your MySQL. The migration therefore defines
  the columns this backend assumes. If your existing tables (e.g. `users`, `questions`) already exist with different columns,
  `db:migrate` will leave them alone and `db:inspect` will list the mismatches; adjust the repositories or add an explicit migration
  (see `database/README.md`). This is the most likely first-run problem.
* Tables in your list that are **not used**: `question_sets`, `question_set_items` (no frontend or requirement defines them).

## Run

```powershell
npm.cmd start        # production-style
npm.cmd run dev      # auto-restart (node --watch)
```

## Roles and the shared admin password

* Public backend registration remains enabled and always creates a `student`. A role supplied by the client is rejected (422); users cannot self-register as admins.
* Create admin accounts directly in MySQL with the SQL query below. Repeat it for each admin, changing only the name and email. Generate one bcrypt hash for the shared password and use that same hash in every admin row and in the backend's `ADMIN_SHARED_PASSWORD_HASH` setting. Admin login checks the central hash, not each row's hash; keeping a valid hash in the row also means an account can still log in normally if it is later changed back to a student.
* Every admin signs in with their own email address and the same shared admin password. Configure the same `ADMIN_SHARED_PASSWORD_HASH` in local `backend/.env` and Render. Generate it once with:
  `node -e "require('bcryptjs').hash(process.stdin.read()?.trim() || 'CHANGE_THIS_PASSWORD', 12).then(console.log)"`
  For a reliable interactive setup, run `node -e "const bcrypt=require('bcryptjs'); const readline=require('readline'); const r=readline.createInterface({input:process.stdin,output:process.stdout}); r.question('Shared admin password: ', async p=>{console.log(await bcrypt.hash(p,12));r.close();});"` and copy the resulting hash into `ADMIN_SHARED_PASSWORD_HASH`. Keep the original shared password private and distribute it only to authorised admins.
* Example SQL (run in the `prepify` database; replace the hash placeholder with the bcrypt hash generated above, and use a unique email for each admin):

  ```sql
  INSERT INTO users (full_name, email, password_hash, role, is_active)
  VALUES ('Prepify Administrator', 'admin@example.com', '<PASTE_THE_GENERATED_BCRYPT_HASH_HERE>', 'admin', 1);
  ```

* Admin password resets are intentionally disabled. Change the shared password by generating a new bcrypt hash and updating `ADMIN_SHARED_PASSWORD_HASH` in every backend environment, then restart/redeploy the backend. This changes the password for all admins at once.
* Existing backend admin-management functionality is retained: an authorised admin can still promote/demote users via `PATCH /api/admin/users/:id/role`, and the operator script `npm run admin:promote -- user@example.com` remains available. Promoted admins also use the same shared password. Role is re-read from the database on every request.

## Business rules I had to choose (none were specified by the frontend)

* **Scoring:** correct = the question's `marks`; wrong or unanswered = 0. No negative marking (no schema field for it).
* **Answer keys:** hidden from students in question listings and during attempts. After an attempt closes, the result includes a review with correct answers and explanations; for scheduled exams, students only get the review after the exam window ends.
* **Attempts:** a test has `max_attempts` (default 1). Starting again while one is open resumes it. Scheduled exams allow exactly one attempt per participant, and the attempt deadline is `min(start + duration, exam end)`.
* **Time limit:** enforced server-side from `deadline_at`. Late answers get 410 `ATTEMPT_EXPIRED` and the attempt is closed and scored from answers saved before the deadline. A late submit is recorded as `expired`.
* **Concurrency:** attempt creation locks the user row (`SELECT … FOR UPDATE`); answers/submission lock the attempt row. Repeat submits return the stored result and never re-score.
* **Practice tests** (`POST /api/tests/practice`) mirror `test-setup.html`: subject, optional topics, difficulty, count, duration. They are built from the existing bank and fail with 409 `INSUFFICIENT_QUESTIONS` rather than inventing questions. `mixed` means "no difficulty filter" (the page defines no ratio).
* **Exam eligibility:** anyone who has the exam code may join (no roster table exists).
* **Editing/deleting** a question that belongs to any test is blocked (409) so historical scoring keys stay valid.
* **Logout** cannot revoke a JWT (stateless); the client must discard it.
* **AI is admin-only** (spends quota, writes into the shared bank). The test-setup page's PDF upload is **not implemented**; the API accepts `syllabusText` instead (PDF parsing would need extra dependencies and was not requested as supported).

## Question import

`database/import-templates/questions.csv` and `.json`. Subjects must already exist (matched by `slug`); topics (optional) must already exist for that subject.

```powershell
npm.cmd run db:import-questions -- .\database\import-templates\questions.csv --dry-run
npm.cmd run db:import-questions -- .\path\to\file.csv
```

Or `POST /api/admin/questions/import`. Each row is validated and inserted in its own transaction; duplicates (same subject + normalised text) are skipped, so re-running a file is safe; failed rows are reported with line numbers. The backend works fine with an empty bank.

## Password reset (Resend)

The password-reset flow uses the Resend HTTP API with Node.js built-in `fetch` (no additional SDK dependency). Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, then run `npm run db:migrate` to create `password_reset_tokens`. The sender must be verified in Resend for general recipient delivery; Resend's onboarding sender is restricted to permitted test recipients. The frontend must be served from an origin listed in `FRONTEND_URL`; reset links use the first configured frontend URL. Tokens are cryptographically random, stored only as SHA-256 hashes, expire after 15 minutes, and are single-use. Requests have per-IP rate limiting and a per-account hourly cap. Both known and unknown addresses receive the same success message.

Endpoints:
- `POST /api/auth/forgot-password` with `{ "email": "student@example.com" }`
- `POST /api/auth/reset-password` with `{ "token": "<64-hex-token>", "password": "new-password" }`

## Gemini

Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in `.env`, restart. The key is only ever read server-side. Output is requested as JSON, then strictly validated (2–6 distinct options, valid correct index, etc.); invalid items are dropped and counted; nothing is saved unless `save: true`. AI is never used for scoring. Failures map to 503 `AI_NOT_CONFIGURED`, 429 `AI_QUOTA_EXCEEDED`/`AI_DAILY_LIMIT`, 502 `AI_INVALID_RESPONSE`/`AI_TIMEOUT`/`AI_PROVIDER_ERROR`, and never affect non-AI routes.

## Testing

```powershell
npm.cmd run test:unit     # no database or network needed — 20 tests
```

Integration tests need a **separate** database (they refuse to run against `prepify`, and never create/drop databases):

```powershell
# in MySQL:  CREATE DATABASE prepify_test;
$env:DB_NAME="prepify_test"; npm.cmd run db:migrate
$env:TEST_DB_NAME="prepify_test"; npm.cmd test
```
Without `TEST_DB_NAME` the integration suite is skipped (reported as skipped, not passed).

## Frontend compatibility findings

Source inspected: every file in `frontend/`.

| Page / script | Reality in the supplied code |
|---|---|
| `login.html`, `signup.html` (`auth.js`) | Browser validation then `alert("…not connected to a backend")`. No request. Fields: `email`, `password`, `fullName`, `confirmPassword`, `remember-me`, `accept-terms`. Password min length 8 (matched by the API; the API also caps at 72 characters because of bcrypt). "Remember me" and "Forgot password" have no backend support (password reset is not implemented). |
| `test-setup.html` (`test-setup.js`) | Collects subject (string slugs like `java`, `data-structures`), topics text, optional PDF, difficulty (easy/medium/hard/mixed), count (10/20/30…), duration (15/30/60). Saves to `sessionStorage`, redirects. The slugs in its `<select>` equal `subjects.slug` in this API only if you create subjects with those slugs; **no subjects are seeded**. |
| `test.html` (`test.js`) | Generates blank placeholder questions client-side, timer client-side, "score unavailable". No request. |
| `dashboard.js`, `history.js`, `results.js`, `join-exam.js`, `question-bank.js`, `admin.js`, `api.js`, `utils.js`, `offline-sync.js` | **Empty (0 bytes).** The HTML for these pages exists but nothing in the page is wired. |
| `frontend/backend` contents | `backend/.gitkeep` only. Nothing to preserve. |

Consequences: there was no existing API contract to match, so the endpoint design in `API_DOCUMENTATION.md` is mine. No page can become end-to-end functional until browser-side code that calls these endpoints is written. That was out of scope by instruction.

## Security summary

Parameterised queries (mysql2), pooled connections, bcrypt (cost 12) with constant-time-ish login, JWT (HS256, id-only payload, role re-read per request), Zod validation (`.strict()` bodies), Helmet, CORS allow-list, rate limits (general 300/min, auth 20/15 min, AI 5/min), generic 500s without stack traces in production, no cookies (so no CSRF surface), ownership checks return 404 for other users' attempts, graceful shutdown on SIGINT/SIGTERM.
Known gaps: rate limiting is in-memory per process; JWTs can't be revoked before expiry; no email verification or password reset; no proctoring (not requested).

## Deployment

Set `NODE_ENV=production`, a strong `JWT_SECRET`, a dedicated least-privilege MySQL user (not `root`), `FRONTEND_URL` to the real origin(s), serve behind HTTPS (`trust proxy` is set to 1 for a single reverse proxy), run with a process manager.

## Troubleshooting

* `Database check FAILED: ER_ACCESS_DENIED_ERROR` → check `DB_USER`/`DB_PASSWORD`; keep the quotes around the password.
* MySQL 8 `caching_sha2_password` issues → mysql2 supports it; if the server is old/odd, create a user with `mysql_native_password`.
* `npm.ps1 cannot be loaded` → use `npm.cmd`.
* CORS errors → make `FRONTEND_URL` match the exact origin shown in the browser (port included).
* `503 DATABASE_UNAVAILABLE` → MySQL not running or wrong settings.
* `JWT_SECRET must be set…` → see Setup.
