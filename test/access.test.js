'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const TEST_PASSWORD = 'test-admin-password-12345';
const TEST_KILL_SWITCH_PASSWORD = 'test-kill-switch-password-6789';
process.env.ADMIN_PASSWORD = TEST_PASSWORD;
process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
process.env.KILL_SWITCH_PASSWORD = TEST_KILL_SWITCH_PASSWORD;
process.env.FIREBASE_PROJECT_ID = 'priceguide-test';
// Explicitly blank out any real Firebase credentials a developer's local .env may define,
// so this suite never accidentally opens a network connection to a live Firestore project.
// (dotenv only fills in vars that are not already present in process.env, so pre-setting
// these to '' — rather than leaving them unset — is what keeps server.js's require('dotenv')
// call from re-populating them from .env.)
process.env.FIREBASE_CLIENT_EMAIL = '';
process.env.FIREBASE_PRIVATE_KEY = '';
process.env.FIREBASE_USE_ADC = 'false';
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const { app } = require('../server.js');

test('dashboard routes require an administrator session and embeds fail closed without storage', async t => {
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
  // With no database credentials the public route cannot verify whether access is paused.
  assert.equal(embedResponse.status, 503);
  assert.match(await embedResponse.text(), /Estimator Temporarily Unavailable/);

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

  const invalidRangeResponse = await fetch(`${baseUrl}/api/services`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({
      categories: [{ id: 'residential', name: 'Residential' }],
      services: [{
        id: 'whole-home',
        title: 'Whole-home Renovation',
        icon: 'house',
        baseCost: 0,
        categoryIds: ['residential'],
        questions: [{
          id: 'q_scope',
          title: 'What is the scope?',
          type: 'single',
          options: [{ label: 'Whole home', minPrice: 70000, maxPrice: 20000 }]
        }]
      }]
    })
  });
  assert.equal(invalidRangeResponse.status, 400);
  assert.deepEqual(await invalidRangeResponse.json(), {
    error: 'An option minimum price cannot exceed its maximum price.'
  });
});

test('the kill switch requires both an administrator session and its own separate password', async t => {
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Not signed in at all: blocked before the kill switch password is even considered.
  const anonymousAttempt = await fetch(`${baseUrl}/api/admin/kill-switch`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: false })
  });
  assert.equal(anonymousAttempt.status, 401);

  const loginResponse = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: TEST_PASSWORD })
  });
  assert.equal(loginResponse.status, 200);
  const adminCookie = loginResponse.headers.get('set-cookie').split(';', 1)[0];
  const [adminCookieName, adminCookieValue] = adminCookie.split('=');

  // Signed in as administrator, but the kill switch's own password was never entered.
  // 403 rather than 401: the admin session is valid, the section's password is what's missing.
  const lockedAttempt = await fetch(`${baseUrl}/api/admin/kill-switch`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ active: false })
  });
  assert.equal(lockedAttempt.status, 403);
  assert.deepEqual(await lockedAttempt.json(), { error: 'Kill switch password required.', code: 'KILL_SWITCH_LOCKED' });

  // Even reading the section is gated, so a tampered-with frontend that forces the panel
  // open cannot display the pause state or the visitor-facing message.
  const lockedRead = await fetch(`${baseUrl}/api/admin/kill-switch`, {
    headers: { Accept: 'application/json', Cookie: adminCookie }
  });
  assert.equal(lockedRead.status, 403);

  // An admin session token replayed under the kill switch's cookie name must not work:
  // the two are scoped separately even though both are signed with the same secret.
  const replayedTokenAttempt = await fetch(`${baseUrl}/api/admin/kill-switch`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${adminCookie}; priceguide_killswitch=${adminCookieValue}`
    },
    body: JSON.stringify({ active: false })
  });
  assert.equal(replayedTokenAttempt.status, 403);

  const wrongPasswordUnlock = await fetch(`${baseUrl}/api/admin/kill-switch/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ password: 'definitely-the-wrong-password' })
  });
  assert.equal(wrongPasswordUnlock.status, 403);
  assert.equal((await wrongPasswordUnlock.json()).code, 'KILL_SWITCH_PASSWORD_INVALID');
  assert.equal(wrongPasswordUnlock.headers.get('set-cookie'), null);

  const unlockResponse = await fetch(`${baseUrl}/api/admin/kill-switch/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ password: TEST_KILL_SWITCH_PASSWORD })
  });
  assert.equal(unlockResponse.status, 200);
  assert.deepEqual(await unlockResponse.json(), { unlocked: true });
  const killSwitchCookie = unlockResponse.headers.get('set-cookie').split(';', 1)[0];
  assert.match(killSwitchCookie, /^priceguide_killswitch=/);

  // Both locks are now open. Firestore isn't configured in this test environment, so the
  // actual write fails, but that 500 (rather than a 401) proves both auth gates passed.
  const unlockedAttempt = await fetch(`${baseUrl}/api/admin/kill-switch`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${adminCookie}; ${killSwitchCookie}`
    },
    body: JSON.stringify({ active: false, message: 'Paused until the invoice is settled.' })
  });
  assert.equal(unlockedAttempt.status, 500);

  const lockAgainResponse = await fetch(`${baseUrl}/api/admin/kill-switch/lock`, {
    method: 'POST',
    headers: { Cookie: `${adminCookie}; ${killSwitchCookie}` }
  });
  assert.equal(lockAgainResponse.status, 204);

  // Signing out must drop the unlock too, so the next person to sign in on this browser
  // does not inherit an unlocked billing section without knowing its password.
  const logoutResponse = await fetch(`${baseUrl}/api/admin/logout`, {
    method: 'POST',
    headers: { Cookie: `${adminCookie}; ${killSwitchCookie}` }
  });
  assert.equal(logoutResponse.status, 204);
  const clearedCookies = logoutResponse.headers.getSetCookie().join(' ');
  assert.match(clearedCookies, /priceguide_admin=/);
  assert.match(clearedCookies, /priceguide_killswitch=/);
});

test('the pause state is not disclosed to callers without an administrator session', async t => {
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const session = await (await fetch(`${baseUrl}/api/admin/session`, { headers: { Accept: 'application/json' } })).json();

  assert.equal(session.authenticated, false);
  assert.equal('estimatorActive' in session, false);
  assert.equal('killSwitchUnlocked' in session, false);
});
