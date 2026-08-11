const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Regression guard for the PUT /auth/theme 500 bug: the query referenced
// users.updated_at, a column that does not exist on the production `users`
// table (confirmed via a rolled-back transaction against real Neon --
// users has only id/agency_id/email/password_hash/full_name/role/ui_theme).
// This is a static guard since the real fix required a live DB check, not
// something a unit test can assert against a schema it doesn't have access to.
const authSrc = fs.readFileSync(path.join(__dirname, 'auth.js'), 'utf8');

const themeUpdateMatch = authSrc.match(/UPDATE users SET ui_theme[^`]*`/);
assert.ok(themeUpdateMatch, 'PUT /auth/theme UPDATE statement not found in auth.js');
assert.ok(
  !/updated_at/.test(themeUpdateMatch[0]),
  'PUT /auth/theme must not reference users.updated_at -- that column does not exist in production and causes every theme save to fail with a 500'
);

console.log('auth.js theme-update query regression test passed');
