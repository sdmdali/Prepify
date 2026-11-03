# Prepify — demo-ready setup

This build keeps the existing `prepify` database untouched and uses a separate `prepify_demo` database for a safe end-to-end demonstration. The demo database gets the schema expected by this backend and 20 real sample Computer Science questions, so a user can register, log in, start a 10- or 20-question practice test, save answers, submit, and view results/history.

## One-time setup (Windows)

1. Keep your existing `backend/.env` file; do not share it or commit it. It must contain the working MySQL connection and a JWT secret of at least 32 characters.
2. Open PowerShell in the `backend` folder.
3. Run `npm.cmd install` only if dependencies are not already installed.
4. Run `npm.cmd run setup:demo`. This creates `prepify_demo`, applies the clean schema, seeds the sample bank, and changes only the `DB_NAME` setting in `backend/.env` to point the app at the demo database. It does not drop or migrate the existing `prepify` database.
5. Start the backend with `npm.cmd start` and leave that terminal open.
6. Open `frontend/index.html` using VS Code Live Server on `http://127.0.0.1:5500`.
7. Register a new student account, log in, choose **Computer Science**, select **Mixed difficulty**, choose 10 or 20 questions, and complete the test. Results and history are saved in MySQL.

## Automated checks

- `npm.cmd run verify:source` checks JavaScript syntax across frontend and backend files.
- `npm.cmd run test:unit` runs unit tests.
- `npm.cmd run test:integration` runs the API integration suite against `prepify_demo`; run it after `setup:demo`. It creates test records in that demo database.

## Honest verification boundary

Static checks can be run in the package. Live MySQL-backed API tests require your local MySQL service and credentials, which are not available inside this authoring environment. Run the integration suite above after setup; do not describe a live end-to-end run as passed until that command completes successfully. The seeded sample questions are demonstration data, not the full 3,300-question bank.
