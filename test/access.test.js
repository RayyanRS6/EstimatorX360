'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const TEST_PASSWORD = 'test-admin-password-12345';
process.env.ADMIN_PASSWORD = TEST_PASSWORD;
process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
process.env.FIREBASE_PROJECT_ID = 'priceguide-test';

const { app } = require('../server.js');

test('dashboard routes require an administrator session while embeds remain public', async t => {
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const rootResponse = await fetch(`${baseUrl}/`, { redirect: 'manual' });
  assert.equal(rootResponse.status, 302);
  assert.equal(rootResponse.headers.get('location'), '/login');

  const dashboardResponse = await fetch(`${baseUrl}/app`, { redirect: 'manual' });
  assert.equal(dashboardResponse.status, 302);
  assert.equal(dashboardResponse.headers.get('location'), '/login');

  const legacyIndexResponse = await fetch(`${baseUrl}/index.html`, { redirect: 'manual' });
  assert.equal(legacyIndexResponse.status, 302);
  assert.equal(legacyIndexResponse.headers.get('location'), '/login');

  const dashboardFileResponse = await fetch(`${baseUrl}/dashboard.html`, { redirect: 'manual' });
  assert.equal(dashboardFileResponse.status, 404);

  const loginPageResponse = await fetch(`${baseUrl}/login`);
  assert.equal(loginPageResponse.status, 200);
  assert.match(await loginPageResponse.text(), /Administrator access/);

  const embedResponse = await fetch(`${baseUrl}/embed?category=residential`);
  assert.equal(embedResponse.status, 200);
  assert.match(await embedResponse.text(), /calculator-wizard-body/);

  const loginResponse = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: TEST_PASSWORD })
  });
  assert.equal(loginResponse.status, 200);
  const sessionCookie = loginResponse.headers.get('set-cookie').split(';', 1)[0];

  const authenticatedDashboardResponse = await fetch(`${baseUrl}/app`, {
    headers: { Cookie: sessionCookie },
    redirect: 'manual'
  });
  assert.equal(authenticatedDashboardResponse.status, 200);
  assert.match(await authenticatedDashboardResponse.text(), /dashboardApp/);
});
