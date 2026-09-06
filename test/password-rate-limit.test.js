'use strict';

const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Firestore } = require('@google-cloud/firestore');

Object.assign(process.env, {
  NODE_ENV: 'test',
  ADMIN_PASSWORD: 'test-admin-password-12345',
  KILL_SWITCH_PASSWORD: 'test-kill-switch-password-6789',
  SESSION_SECRET: 'test-session-secret-with-at-least-32-characters',
  FIREBASE_PROJECT_ID: 'priceguide-test',
  FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '',
  FIREBASE_USE_ADC: 'true', GOOGLE_APPLICATION_CREDENTIALS: ''
});

let databaseCalls = 0;
function unexpectedDatabaseCall() {
  databaseCalls++;
  throw new Error('Password attempts must not access Firestore');
}
mock.method(Firestore.prototype, 'collection', () => ({
  get: unexpectedDatabaseCall,
  doc: () => ({ get: unexpectedDatabaseCall, set: unexpectedDatabaseCall })
}));
const { app } = require('../server.js');
mock.restoreAll();

async function client(t) {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return (endpoint, ip, password, cookie = '') => fetch(base + endpoint, {
    method: 'POST',
    headers: { Origin: base, 'X-Forwarded-For': ip, 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ password })
  });
}

async function assertLimited(response) {
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'RATE_LIMITED');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(Number(response.headers.get('retry-after')) > 0);
  assert.ok(Number(response.headers.get('retry-after')) <= 900);
  assert.equal(response.headers.get('set-cookie'), null);
}

test('admin password allows five failures then blocks even a correct password without database access', async t => {
  const request = await client(t);
  for (let i = 0; i < 5; i++) {
    assert.equal((await request('/api/admin/login', '192.0.2.10', 'wrong-password')).status, 401);
  }
  await assertLimited(await request('/api/admin/login', '192.0.2.10', 'wrong-password'));
  await assertLimited(await request('/api/admin/login', '192.0.2.10', process.env.ADMIN_PASSWORD));
  assert.equal((await request('/api/admin/login', '192.0.2.11', process.env.ADMIN_PASSWORD)).status, 200);
  assert.equal(databaseCalls, 0);
});

test('kill switch password has its own lockout and does not invalidate the admin session', async t => {
  const request = await client(t);
  const login = await request('/api/admin/login', '192.0.2.20', process.env.ADMIN_PASSWORD);
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  for (let i = 0; i < 5; i++) {
    const response = await request('/api/admin/kill-switch/unlock', '192.0.2.20', process.env.ADMIN_PASSWORD, cookie);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'KILL_SWITCH_PASSWORD_INVALID');
  }
  await assertLimited(await request('/api/admin/kill-switch/unlock', '192.0.2.20', process.env.KILL_SWITCH_PASSWORD, cookie));
  assert.equal((await request('/api/admin/kill-switch/lock', '192.0.2.20', '', cookie)).status, 204);
  assert.equal((await request('/api/admin/login', '192.0.2.20', process.env.ADMIN_PASSWORD)).status, 200);
  assert.equal(databaseCalls, 0);
});

test('anonymous kill switch attempts also hit the password endpoint limit', async t => {
  const request = await client(t);
  for (let i = 0; i < 5; i++) {
    assert.equal((await request('/api/admin/kill-switch/unlock', '192.0.2.30', 'wrong-password')).status, 401);
  }
  await assertLimited(await request('/api/admin/kill-switch/unlock', '192.0.2.30', 'wrong-password'));
  assert.equal(databaseCalls, 0);
});

test('successful passwords do not consume the failed-attempt allowance', async t => {
  const request = await client(t);
  for (let i = 0; i < 7; i++) {
    const login = await request('/api/admin/login', '192.0.2.40', process.env.ADMIN_PASSWORD);
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie()[0].split(';')[0];
    assert.equal((await request('/api/admin/kill-switch/unlock', '192.0.2.40', process.env.KILL_SWITCH_PASSWORD, cookie)).status, 200);
  }
  assert.equal(databaseCalls, 0);
});

test('a concurrent password guessing burst cannot exceed the allowance', async t => {
  const request = await client(t);
  const results = await Promise.all(Array.from({ length: 20 }, () => request('/api/admin/login', '192.0.2.50', 'wrong-password')));
  assert.equal(results.filter(response => response.status === 401).length, 5);
  assert.equal(results.filter(response => response.status === 429).length, 15);
  assert.equal(databaseCalls, 0);
});

test('password lockout expires after the 15-minute window', async t => {
  const request = await client(t);
  for (let i = 0; i < 5; i++) await request('/api/admin/login', '192.0.2.60', 'wrong-password');
  await assertLimited(await request('/api/admin/login', '192.0.2.60', process.env.ADMIN_PASSWORD));
  t.mock.method(Date, 'now', () => new Date().getTime() + 15 * 60 * 1000 + 1000);
  assert.equal((await request('/api/admin/login', '192.0.2.60', process.env.ADMIN_PASSWORD)).status, 200);
  assert.equal(databaseCalls, 0);
});
