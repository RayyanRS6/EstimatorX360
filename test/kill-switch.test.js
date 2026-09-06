'use strict';

const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Firestore } = require('@google-cloud/firestore');

Object.assign(process.env, {
  NODE_ENV: 'test',
  ADMIN_PASSWORD: 'test-admin-password-12345',
  KILL_SWITCH_PASSWORD: 'test-kill-switch-password-6789',
  SESSION_SECRET: 'test-session-secret-with-at-least-32-characters',
  FIREBASE_PROJECT_ID: 'priceguide-test',
  FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '',
  FIREBASE_USE_ADC: 'true', GOOGLE_APPLICATION_CREDENTIALS: '',
  FIRESTORE_KILL_SWITCH_COLLECTION: 'kill_switch'
});

// Only the database boundary is replaced. Exercise the real HTTP routes, signed
// cookies and storage helpers without connecting to a developer's Firebase project.
let storedStatus;
let readFails = false;
let writeFails = false;
mock.method(Firestore.prototype, 'collection', name => ({
  doc(id) {
    assert.equal(name, 'kill_switch');
    assert.equal(id, 'status');
    return {
      async get() {
        if (readFails) throw new Error('Simulated database outage');
        return { exists: Boolean(storedStatus), data: () => storedStatus };
      },
      async set(value) {
        if (writeFails) throw new Error('Simulated write failure');
        storedStatus = structuredClone(value);
      }
    };
  }
}));
const { app } = require('../server.js');
mock.restoreAll();

function expiredCookie(name, scope) {
  const payload = Buffer.from(JSON.stringify({ v: 1, scope, exp: 1 })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  return `${name}=${payload}.${signature}`;
}

test('pause and resume persist, keep admin access, and protect every public embed route', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, method = 'GET', cookie = '', body) => fetch(base + url, {
    method, headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: base },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const embeds = ['/embed', '/embed/', '/embed?category=residential', '/embed?service=kitchen', '/embed?embed=1'];
  for (const url of embeds) assert.equal((await request(url)).status, 200);

  const login = await request('/api/admin/login', 'POST', '', { password: process.env.ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  const adminCookie = login.headers.getSetCookie()[0].split(';')[0];
  const locked = await request('/api/admin/kill-switch', 'PUT', adminCookie, { active: false });
  assert.equal(locked.status, 403);
  assert.equal((await locked.json()).code, 'KILL_SWITCH_LOCKED');

  const adminPasswordAttempt = await request('/api/admin/kill-switch/unlock', 'POST', adminCookie, { password: process.env.ADMIN_PASSWORD });
  assert.equal(adminPasswordAttempt.status, 403);
  const unlock = await request('/api/admin/kill-switch/unlock', 'POST', adminCookie, { password: process.env.KILL_SWITCH_PASSWORD });
  assert.equal(unlock.status, 200);
  const unlockCookie = unlock.headers.getSetCookie()[0].split(';')[0];
  const cookies = `${adminCookie}; ${unlockCookie}`;
  const message = 'Paused <script>alert(1)</script>';
  const pause = await request('/api/admin/kill-switch', 'PUT', cookies, { active: false, message });
  assert.equal(pause.status, 200);
  assert.equal(pause.headers.get('set-cookie'), null, 'pausing must not replace either session');
  assert.equal((await pause.json()).active, false);
  assert.equal(storedStatus.active, false);
  assert.equal((await (await request('/api/admin/kill-switch', 'GET', cookies)).json()).active, false);
  const session = await (await request('/api/admin/session', 'GET', cookies)).json();
  assert.equal(session.authenticated, true);
  assert.equal(session.killSwitchUnlocked, true);
  assert.equal(session.estimatorActive, false);

  for (const url of embeds) {
    const response = await request(url);
    assert.equal(response.status, 503, url);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text();
    assert.match(html, /Paused &lt;script&gt;/);
    assert.doesNotMatch(html, /calculator-wizard-body|<script>alert/);
  }
  assert.equal((await request('/api/services')).status, 503);
  assert.equal((await request('/api/estimate', 'POST', '', {})).status, 503);
  assert.equal((await request('/app', 'GET', adminCookie)).status, 200);
  assert.equal((await request('/embed', 'GET', adminCookie)).status, 200);

  const expiredUnlock = `${adminCookie}; ${expiredCookie('priceguide_killswitch', 'kill-switch')}`;
  const retry = await request('/api/admin/kill-switch', 'PUT', expiredUnlock, { active: true });
  assert.equal(retry.status, 403);
  assert.equal((await retry.json()).code, 'KILL_SWITCH_LOCKED');
  assert.equal(storedStatus.active, false);
  const expiredAdmin = `${expiredCookie('priceguide_admin', 'admin')}; ${unlockCookie}`;
  const expired = await request('/api/admin/kill-switch/unlock', 'POST', expiredAdmin, { password: process.env.KILL_SWITCH_PASSWORD });
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).code, 'ADMIN_AUTH_REQUIRED');

  readFails = true;
  assert.equal((await request('/embed')).status, 503);
  assert.equal((await request('/api/services')).status, 503);
  assert.equal((await request('/api/estimate', 'POST', '', {})).status, 503);
  assert.equal((await request('/api/admin/kill-switch', 'GET', cookies)).status, 503);
  readFails = false;
  writeFails = true;
  assert.equal((await request('/api/admin/kill-switch', 'PUT', cookies, { active: true })).status, 500);
  assert.equal(storedStatus.active, false);
  writeFails = false;
  const resume = await request('/api/admin/kill-switch', 'PUT', cookies, { active: true, message });
  assert.equal(resume.status, 200);
  assert.equal((await resume.json()).active, true);
  for (const url of embeds) assert.equal((await request(url)).status, 200);
});
