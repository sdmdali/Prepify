'use strict';
// Explicit, operator-run promotion of an EXISTING account. No default admin is ever created.
// Usage: npm run admin:promote -- someone@example.com
const { query, closePool } = require('../src/config/database');
(async () => {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) { console.error('Usage: npm run admin:promote -- <email>'); process.exitCode = 1; return; }
  try {
    const r = await query("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
    if (r.affectedRows === 0) { console.error('No user with that email. Register the account first.'); process.exitCode = 1; }
    else console.log(`${email} is now an admin.`);
  } catch (e) { console.error(`Failed: ${e.code || e.message}`); process.exitCode = 1; }
  finally { await closePool(); }
})();
