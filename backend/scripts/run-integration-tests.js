'use strict';
// Cross-platform runner. Integration tests are deliberately pointed at the isolated demo DB.
const path = require('path');
const { spawnSync } = require('child_process');
const jestBin = require.resolve('jest/bin/jest');
const result = spawnSync(process.execPath, [jestBin, '--runInBand'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, TEST_DB_NAME: process.env.TEST_DB_NAME || 'prepify_demo' },
  stdio: 'inherit',
});
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
