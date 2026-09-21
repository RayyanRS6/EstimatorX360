'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.ADMIN_PASSWORD = 'test-admin-password-12345';
process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
process.env.KILL_SWITCH_PASSWORD = 'test-kill-switch-password-6789';
process.env.FIREBASE_PROJECT_ID = 'priceguide-test';
process.env.FIREBASE_CLIENT_EMAIL = '';
process.env.FIREBASE_PRIVATE_KEY = '';
process.env.FIREBASE_USE_ADC = 'false';
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const { validateServices, isServiceEnabled } = require('../server.js');

const root = path.join(__dirname, '..');
const categories = [{ id: 'residential', name: 'Residential' }];

const baseService = {
  id: 'kitchen-renovation',
  title: 'Kitchen Renovation',
  icon: 'kitchen',
  baseCost: 5000,
  categoryIds: ['residential'],
  questions: []
};

test('forms saved before the switch existed stay published', () => {
  const services = validateServices([baseService], categories);
  assert.equal(services[0].enabled, true);
  assert.equal(isServiceEnabled(services[0]), true);
});

test('an explicit disabled flag survives validation and is not coerced away', () => {
  const services = validateServices([{ ...baseService, enabled: false }], categories);
  assert.equal(services[0].enabled, false);
  assert.equal(isServiceEnabled(services[0]), false);
  assert.equal(validateServices([{ ...baseService, enabled: true }], categories)[0].enabled, true);
});

test('a non-boolean enabled value is rejected rather than guessed at', () => {
  assert.equal(validateServices([{ ...baseService, enabled: 'yes' }], categories), null);
  assert.equal(validateServices([{ ...baseService, enabled: 0 }], categories), null);
  assert.equal(validateServices([{ ...baseService, enabled: null }], categories), null);
});

test('the public catalogue drops disabled forms while the admin catalogue keeps them', () => {
  const stored = validateServices([
    { ...baseService, enabled: false },
    { ...baseService, id: 'bathroom-renovation', title: 'Bathroom Renovation', enabled: true }
  ], categories);

  assert.deepEqual(stored.filter(isServiceEnabled).map(service => service.id), ['bathroom-renovation']);
  assert.equal(stored.length, 2);
});

test('only the public services route filters the catalogue', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

  assert.match(server, /app\.get\('\/api\/services', requireActiveEstimator, sendCatalog\(\{ publicOnly: true \}\)\)/);
  assert.match(server, /app\.get\('\/api\/admin\/services', requireAdmin, sendCatalog\(\{ publicOnly: false \}\)\)/);
  // A form switched off mid-session must stop accepting submissions, not merely disappear.
  assert.match(server, /code: 'FORM_DISABLED'/);
  assert.match(server, /error\?\.code === 'FORM_DISABLED'.*503/);
});

test('the Price Guide hides disabled forms and the builder offers the switch', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

  assert.match(app, /function isServiceEnabled\(service\) \{\s*return service\?\.enabled !== false;/);
  assert.match(app, /const publishedServices = state\.services\.filter\(isServiceEnabled\)/);
  assert.match(app, /function toggleServiceEnabled\(serviceId, enabled\)/);
  assert.match(app, /id="service-enabled-toggle"/);
  // A single-form embed link for a switched-off form must not fall back to every other form.
  assert.match(app, /requestedEmbedServiceId && !state\.services\.some\(item => item\.id === requestedEmbedServiceId && isServiceEnabled\(item\)\)/);
});
