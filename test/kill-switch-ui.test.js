'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const section = source.slice(source.indexOf('async function handleKillSwitchAuthError'), source.indexOf('function setupEmbeddedHeightMessaging'));

function dashboard(responses) {
  const container = { innerHTML: '' };
  const password = { value: 'test-kill-switch-password' };
  const calls = [];
  const toasts = [];
  const context = vm.createContext({
    state: { adminAuthenticated: true, killSwitch: { active: true, unlocked: true, message: '', updatedAt: '' } },
    document: { getElementById: id => id === 'kill-switch-container' ? container : password },
    CURRENCY_LOCALE: 'en-CA',
    getIconSvg: () => '', escapeHtml: value => String(value), setTimeout: () => {},
    renderAdminGate: element => { element.innerHTML = 'Administrator Password'; },
    renderKillSwitchBanner: () => {}, showToast: message => toasts.push(message),
    async fetch(url, options) {
      calls.push({ url, options });
      assert.ok(responses.length, `Unexpected request: ${url}`);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return { status: next.status, ok: next.status >= 200 && next.status < 300, json: async () => next.body };
    }
  });
  vm.runInContext(section, context);
  return { context, container, password, calls, toasts };
}

for (const legacy of [false, true]) {
  test(`an expired section password keeps the admin signed in (${legacy ? 'legacy 401' : 'coded 403'})`, async () => {
    const responses = legacy
      ? [{ status: 401, body: { error: 'Kill switch password required.' } }, { status: 200, body: { authenticated: true } }]
      : [{ status: 403, body: { error: 'Kill switch password required.', code: 'KILL_SWITCH_LOCKED' } }];
    const { context, container, toasts } = dashboard(responses);
    await context.pushKillSwitchUpdate(false, '', 'Paused');
    assert.equal(context.state.adminAuthenticated, true);
    assert.equal(context.state.killSwitch.active, true, 'a rejected save must not change displayed status');
    assert.equal(context.state.killSwitch.unlocked, false);
    assert.match(container.innerHTML, /Kill Switch Password/);
    assert.doesNotMatch(container.innerHTML, /Administrator Password/);
    assert.doesNotMatch(toasts.join(' '), /administrator session expired/i);
  });
}

test('actual admin expiry during unlock shows the administrator gate', async () => {
  const { context, container, password } = dashboard([
    { status: 401, body: { error: 'Administrator authentication required.', code: 'ADMIN_AUTH_REQUIRED' } }
  ]);
  await context.unlockKillSwitch({ preventDefault() {} });
  assert.equal(context.state.adminAuthenticated, false);
  assert.equal(context.state.killSwitch.unlocked, false);
  assert.equal(password.value, '');
  assert.match(container.innerHTML, /Administrator Password/);
});

test('a wrong kill switch password keeps the kill switch gate and admin session', async () => {
  const { context, container, password, toasts } = dashboard([
    { status: 403, body: { error: 'Invalid kill switch password.', code: 'KILL_SWITCH_PASSWORD_INVALID' } }
  ]);
  context.state.killSwitch.unlocked = false;
  context.renderKillSwitchGate();
  await context.unlockKillSwitch({ preventDefault() {} });
  assert.equal(context.state.adminAuthenticated, true);
  assert.equal(context.state.killSwitch.unlocked, false);
  assert.equal(password.value, '');
  assert.match(container.innerHTML, /Kill Switch Password/);
  assert.deepEqual(toasts, ['Invalid kill switch password.']);
});

test('origin failures are reported without pretending either session expired', async () => {
  const { context, toasts } = dashboard([{ status: 403, body: { error: 'Cross-origin request rejected.' } }]);
  await context.pushKillSwitchUpdate(false, '', 'Paused');
  assert.equal(context.state.adminAuthenticated, true);
  assert.equal(context.state.killSwitch.unlocked, true);
  assert.equal(context.state.killSwitch.active, true);
  assert.deepEqual(toasts, ['Cross-origin request rejected.']);
});

test('an unavailable legacy session check does not sign the administrator out', async () => {
  const { context, toasts } = dashboard([
    { status: 401, body: { error: 'Authentication required.' } },
    { status: 503, body: { error: 'Service unavailable.' } }
  ]);
  await context.pushKillSwitchUpdate(false, '', 'Paused');
  assert.equal(context.state.adminAuthenticated, true);
  assert.equal(context.state.killSwitch.active, true);
  assert.deepEqual(toasts, ['Unable to verify your session. Please try again.']);
});

test('unlock, pause, reload, and resume render the server state without another admin login', async () => {
  const paused = { active: false, message: 'Temporarily unavailable', updatedAt: '2026-09-06T10:00:00Z' };
  const { context, container, calls } = dashboard([
    { status: 200, body: { unlocked: true } },
    { status: 200, body: { active: true } },
    { status: 200, body: paused },
    { status: 200, body: paused },
    { status: 200, body: { ...paused, active: true } }
  ]);
  await context.unlockKillSwitch({ preventDefault() {} });
  await context.pushKillSwitchUpdate(false, paused.message, 'Paused');
  assert.equal(context.state.killSwitch.active, false);
  assert.match(container.innerHTML, /Estimator is paused/);
  await context.renderKillSwitchSettings();
  assert.match(container.innerHTML, /Estimator is paused/);
  await context.pushKillSwitchUpdate(true, paused.message, 'Resumed');
  assert.equal(context.state.killSwitch.active, true);
  assert.equal(context.state.adminAuthenticated, true);
  assert.equal(context.state.killSwitch.unlocked, true);
  assert.match(container.innerHTML, /Estimator is live/);
  assert.equal(calls.some(call => call.url === '/api/admin/login'), false);
});
