# Database notes

* Existing data is never modified by this backend's tooling. No script drops, truncates or recreates a database.
* `migrations/001_initial_schema.sql` — `CREATE TABLE IF NOT EXISTS` for the 14 tables the API uses. Tables that already exist are skipped untouched.
* Applied migrations are recorded in `schema_migrations` with a checksum; editing an applied file is refused. To change schema later, add `002_*.sql` (additive `ALTER TABLE … ADD COLUMN` is fine; `DROP`/`TRUNCATE`/`DELETE FROM` are blocked by the runner).
* Run `npm run db:inspect` first: it lists your real columns and reports mismatches with what the code expects.
* `seeds/` is intentionally empty: no fake subjects or questions are provided. Create subjects with `POST /api/subjects`
  (use the same slugs as the `<select>` on `test-setup.html` if you want them to line up, e.g. `java`, `data-structures`).

## Assumed key design points

* `questions.text_hash` (SHA-256 of normalised text) + unique `(subject_id, text_hash)` → duplicate detection.
* `question_options(question_id, option_index, option_text, is_correct)`; exactly one correct option is enforced in code.
* `test_attempts` stores `deadline_at` (server-computed), `score`, `max_score`; `student_answers` unique per `(attempt_id, question_id)`.
* Timestamps are UTC (`timezone: 'Z'`, `dateStrings`).
