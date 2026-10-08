'use strict';

const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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

// Only the database boundary is replaced: the price guide is stored as paused, so
// /embed answers with the server-rendered notice whose colours follow ?theme=.
mock.method(Firestore.prototype, 'collection', () => ({
  async get() { return { empty: true, docs: [] }; },
  doc() {
    return { async get() { return { exists: true, data: () => ({ active: false, message: 'Paused for testing.' }) }; } };
  }
}));
const { app } = require('../server.js');
mock.restoreAll();

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

// Runs app.js's embed-mode and theme detection against a given page URL.
function detectTheme(href) {
  const setup = appSource.slice(appSource.indexOf('const pageUrl = '), appSource.indexOf('let embedResizeFrame'));
  const apply = appSource.slice(appSource.indexOf('function applyEmbedTheme'), appSource.indexOf('function setupThemeToggle'));
  const fontLink = { href: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap' };
  const documentElement = { dataset: {} };
  const context = vm.createContext({
    URL,
    window: { location: { href } },
    document: { documentElement, querySelector: () => fontLink }
  });
  vm.runInContext(`${apply}\n${setup}\nthis.result = { embedTheme, isEmbedMode };`, context);
  return { ...context.result, applied: documentElement.dataset.embedTheme, fontHref: fontLink.href };
}

test('only a listed theme is applied, and only on the public embed', () => {
  const themed = detectTheme('https://estimator.bridgelandbuilders.com/embed?service=kitchen-renovations&theme=bridgeland');
  assert.equal(themed.embedTheme, 'bridgeland');
  assert.equal(themed.applied, 'bridgeland');
  assert.match(themed.fontHref, /opsz/, 'the site-matched font request replaces the default one');

  assert.equal(detectTheme('https://estimator.bridgelandbuilders.com/embed?theme=Bridgeland').applied, 'bridgeland');

  for (const href of [
    'https://estimator.bridgelandbuilders.com/embed',
    'https://estimator.bridgelandbuilders.com/embed?theme=unknown',
    'https://estimator.bridgelandbuilders.com/app?theme=bridgeland'
  ]) {
    const result = detectTheme(href);
    assert.equal(result.embedTheme, '', href);
    assert.equal(result.applied, undefined, href);
    assert.doesNotMatch(result.fontHref, /opsz/, href);
  }
});

test('every theme rule is scoped to the theme attribute, so the original design is untouched', () => {
  const start = styles.indexOf('SITE-MATCHED EMBED THEME: BRIDGELAND BUILDERS');
  assert.ok(start > -1);
  const block = styles.slice(styles.indexOf('*/', start) + 2).replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...block.matchAll(/([^{}]+)\{/g)]
    .map(match => match[1].trim())
    .filter(selector => !selector.startsWith('@media'));
  assert.ok(selectors.length > 20);
  for (const group of selectors) {
    for (const selector of group.split(',')) {
      assert.match(selector.trim(), /^html\[data-embed-theme="bridgeland"\]/, selector.trim());
    }
  }
});

test('the product is named Price Calculator and keeps its AutomateX360 credit', () => {
  const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
  for (const source of [appSource, dashboard, login]) assert.doesNotMatch(source, /PriceGuideX360/);
  const footer = appSource.slice(appSource.indexOf('function getBrandFooterHtml'), appSource.indexOf('function renderCalculator'));
  assert.match(footer, /<span>Price Calculator<\/span>/);
  assert.match(footer, /href="https:\/\/automatex360\.com"/);
  assert.match(footer, /Powered By <strong>AutomateX360<\/strong>/);
  assert.match(dashboard, /<title>Price Calculator — Powered By AutomateX360<\/title>/);
});

test('a paused embed notice follows the requested theme and ignores unknown ones', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = async query => {
    const response = await fetch(`${base}/embed${query}`);
    assert.equal(response.status, 503);
    return response.text();
  };

  const themed = await page('?category=residential&theme=bridgeland');
  assert.match(themed, /color: #C20917;/);
  assert.match(themed, /color: #217A8A;/);
  assert.match(themed, /Paused for testing\./);
  assert.match(themed, /automatex360:resize/);

  for (const query of ['', '?theme=unknown', '?theme=bridgeland&theme=other', '?theme=%3Cscript%3E']) {
    const html = await page(query);
    assert.match(html, /background: #F4F5F8;/, query);
    assert.match(html, /color: #FA5838;/, query);
    assert.doesNotMatch(html, /#C20917|<script>alert/, query);
  }
});
