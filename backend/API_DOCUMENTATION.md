# Prepify API

Base URL: `http://localhost:8080/api` · JSON only · Auth: `Authorization: Bearer <token>`

Success: `{ "success": true, "data": … }`
Error: `{ "success": false, "error": { "code": "…", "message": "…", "details": […] } }`

Status codes: 200/201/204 success · 400 bad JSON · 401 unauthenticated · 403 wrong role/not joined · 404 not found (also for other users' resources) · 409 state conflict · 410 expired/ended · 413 too large · 422 validation · 429 rate/quota · 502/503 upstream or DB/AI unavailable.

> There is no pre-existing frontend contract (the frontend makes no API calls); these endpoints are the designed contract.
> Marked **A** = admin only. All others need a logged-in user.

## Health / Auth
| Method & path | Body | Notes |
|---|---|---|
| GET `/health` | – | Public. 503 when DB is down. Reports `ai: configured/not_configured`. |
| POST `/auth/register` | `{fullName,email,password(8–72)}` | 201 `{user,token}`. Always `student`. 409 `EMAIL_TAKEN`. Extra fields (e.g. `role`) → 422. |
| POST `/auth/login` | `{email,password}` | 200 `{user,token}`; 401 for any bad credential. |
| POST `/auth/logout` | – | Stateless; client discards token. |
| GET `/auth/me`, GET `/users/me` | – | Current user. |

## Catalog & questions
| Method & path | Body / query | Notes |
|---|---|---|
| GET `/subjects` | – | |
| POST `/subjects` **A** | `{slug,name}` | 409 on duplicate slug. |
| GET `/subjects/:id/topics` | – | |
| POST `/subjects/:id/topics` **A** | `{name}` | |
| GET `/questions` | `subjectId,topicId,difficulty,search,page,limit` | Students: no `isCorrect`/`explanation`. Admin: full. |
| GET `/questions/:id` | – | same visibility rule |
| POST `/questions` **A** | `{subjectId,topicId?,questionText,options[2–6],correctIndex,difficulty,marks,explanation?}` | 409 `DUPLICATE_QUESTION`. |
| PUT `/questions/:id` **A** | same | 409 `QUESTION_IN_USE` if in any test. |
| DELETE `/questions/:id` **A** | – | 204; 409 if in a test. |
| POST `/admin/questions/import` **A** | `{format:'csv'|'json',content?|rows?,fileName?,dryRun?}` | Returns `{totalRows,inserted,duplicates,failed,failures:[{row,error}]}`. |

## Tests, attempts, results
| Method & path | Body | Notes |
|---|---|---|
| GET `/tests` | `subjectId,status(A),page,limit` | Students see published admin tests + their own practice tests. |
| GET `/tests/:id` | – | Hidden tests → 404. |
| POST `/tests` **A** | `{title,subjectId?,durationMinutes,maxAttempts?,questionIds?}` | Created as `draft`. |
| PUT `/tests/:id/questions` **A** | `{questionIds[]}` | Draft only. Order = position. |
| POST `/tests/:id/publish` · `/archive` **A** | – | Publish needs ≥1 question (409 `TEST_EMPTY`). |
| POST `/tests/practice` | `{subjectId,topicIds?,difficulty:easy|medium|hard|mixed,questionCount,durationMinutes}` | Builds a published practice test from the bank; 409 `INSUFFICIENT_QUESTIONS` `{available,requested}`. |
| POST `/tests/:id/attempts` | – | 201 new / 200 resumed. Returns `{attempt,questions(no key),answers}`. 409 `ATTEMPT_LIMIT_REACHED`. |
| GET `/attempts/:id` | – | Owner only. |
| PUT `/attempts/:id/answer` | `{questionId,selectedIndex|null}` | 422 if question not in test or option out of range; 409 `ATTEMPT_CLOSED`; 410 `ATTEMPT_EXPIRED`. |
| PUT `/attempts/:id/answers` | `{answers:[…]}` | Bulk, all-or-nothing. |
| POST `/attempts/:id/submit` | (body ignored) | Idempotent; returns result; `alreadySubmitted` flag. |
| GET `/results` | `page,limit` | Own history (stale open attempts are closed first). |
| GET `/results/:id` | – | Owner or admin. 409 while in progress. `review` (with correct answers) when allowed. |

## Examinations
| Method & path | Body | Notes |
|---|---|---|
| POST `/exams` **A** | `{testId,title,startsAt,endsAt}` (ISO-8601) | Generates 8-char `examCode`. Test must be published. |
| GET `/exams` **A** | `page,limit` | with `phase`: upcoming/open/ended/cancelled |
| POST `/exams/:id/cancel` **A** | – | |
| GET `/exams/:id/participants` · `/logs` · `/results` **A** | – | Activity log: created, joined, started, submitted. |
| POST `/exams/join` | `{code}` | 404 unknown/cancelled, 410 ended. Registers participant. |
| POST `/exams/:id/attempts` | – | Must have joined (403); 409 `EXAM_NOT_STARTED`; 410 `EXAM_ENDED`; one attempt only; deadline ≤ exam end. |

## Admin
GET `/admin/stats` · GET `/admin/users` · PATCH `/admin/users/:id/role` `{role}` · PATCH `/admin/users/:id/active` `{isActive}` (cannot target self).

## AI (admin, 5 req/min + `AI_DAILY_LIMIT`/day)
| POST `/ai/questions/generate` | `{subjectId,topic?|syllabusText?,difficulty,count(1–20),save?,topicId?}` | Returns validated questions (`rejectedCount` for dropped ones). `save:true` stores them with `source='ai'`, skipping duplicates. |
|---|---|---|
| POST `/ai/explanations` | `{questionId,save?}` | Generates an explanation for an existing question. |

AI errors: 503 `AI_NOT_CONFIGURED`/`AI_AUTH_FAILED`, 429 `AI_QUOTA_EXCEEDED`/`AI_DAILY_LIMIT`, 502 `AI_INVALID_RESPONSE`/`AI_TIMEOUT`/`AI_EMPTY_RESPONSE`/`AI_PROVIDER_ERROR`/`AI_BAD_REQUEST`.

## Frontend compatibility map
| Frontend element | Maps to | Integrated today? |
|---|---|---|
| signup form | POST `/auth/register` | No (alert only) |
| login form | POST `/auth/login` | No (alert only) |
| test-setup form | POST `/tests/practice` then POST `/tests/:id/attempts` | No (sessionStorage) |
| test.html answers / submit | PUT `/attempts/:id/answers`, POST `/attempts/:id/submit` | No (placeholder questions) |
| results.html | GET `/results/:id` | No (empty script) |
| history.html | GET `/results` | No (empty script) |
| join-exam.html | POST `/exams/join`, POST `/exams/:id/attempts` | No (empty script) |
| question-bank.html | GET `/questions`, GET `/subjects` | No (empty script) |
| admin.html | `/admin/*`, `/exams`, `/tests`, `/questions`, import, `/ai/*` | No (empty script) |
| dashboard.html | GET `/results`, GET `/tests` | No (empty script) |
| syllabus PDF upload | not implemented (use `syllabusText`) | – |
| forgot password / remember me | not implemented | – |

### AI-generated college examination
`POST /api/exams/ai` (administrator only) creates a complete scheduled examination from an AI-generated paper. JSON fields: `title`, `subjectId`, `count` (10, 20, 30, or 50), `durationMinutes`, `startsAt` and `endsAt` (ISO datetime strings); optional `topic`, `syllabusText` and `difficulty`. The backend generates the paper once and stores a fixed snapshot used by all participants. No bulk question import is needed.


## Password reset

### Request a reset link
`POST /api/auth/forgot-password`

Request: `{ "email": "student@example.com" }`

Response is intentionally generic so the endpoint does not disclose whether an account exists: `{ "success": true, "data": { "message": "If an account exists for that email address, a password reset link has been sent." } }`.

### Complete a reset
`POST /api/auth/reset-password`

Request: `{ "token": "<64-character-hex-token>", "password": "at-least-8-characters" }`. The reset token expires after 15 minutes and can only be used once.
