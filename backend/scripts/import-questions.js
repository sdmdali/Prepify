'use strict';
// Usage: npm run db:import-questions -- <file.csv|file.json> [--dry-run]
const fs = require('fs');
const path = require('path');
const { closePool } = require('../src/config/database');
const svc = require('../src/services/question.service');

(async () => {
  const file = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!file || file.startsWith('--')) { console.error('Usage: npm run db:import-questions -- <file.csv|file.json> [--dry-run]'); process.exitCode = 1; return; }
  try {
    const ext = path.extname(file).toLowerCase();
    if (!['.csv', '.json'].includes(ext)) throw new Error('File must be .csv or .json');
    const content = fs.readFileSync(file, 'utf8');
    const summary = await svc.importRows(null, { format: ext.slice(1), content, fileName: path.basename(file), dryRun });
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failed) process.exitCode = 3;
  } catch (e) { console.error(`Import FAILED: ${e.message}`); process.exitCode = 1; }
  finally { await closePool(); }
})();
