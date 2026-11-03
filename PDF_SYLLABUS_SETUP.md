# Prepify PDF syllabus generation

## What is included
- Authenticated `POST /api/syllabus/extract` endpoint for PDF text extraction.
- 10 MB PDF upload limit and PDF signature validation.
- Rejects scanned/image-only PDFs with a clear message; OCR is not included.
- Extracted syllabus text is passed into the existing practice generation endpoint. In syllabus mode, unrelated existing question-bank items are not used to fill the test.
- Existing frontend design is preserved.

## Setup
1. Extract this ZIP into a new folder.
2. Copy your existing private `backend/.env` into the extracted project's `backend` folder (do not share it).
3. Open a terminal in `backend` and run `npm.cmd install` to install/update dependencies including `multer` and `pdf-parse`.
4. Run `npm.cmd start`.
5. Run the frontend with Live Server and sign in. Choose a subject, upload a text-based syllabus PDF (10 MB maximum), select count/difficulty, and start practice.

## Limitations
- Scanned PDFs without selectable text are rejected with an explanatory message. OCR is not implemented.
- AI provider configuration/quota and database connectivity are still required.
- PDF text is capped at 80,000 characters to keep requests bounded.
