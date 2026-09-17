'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const monitor = source.slice(source.indexOf('function setupEmbedAvailabilityMonitoring'), source.indexOf('function setupEmbeddedHeightMessaging'));

test('an already-open embed hides the calculator on pause and reloads on resume', async () => {
  const dashboard = { style: {} };
  const modal = { style: {} };
  const elements = { dashboardApp: dashboard };
  const events = {};
  let tick;
  let status = { estimatorActive: true };
  let fail = false;
  let reloads = 0;
  const context = vm.createContext({
    AbortSignal,
    fetch: async (_url, options) => {
      assert.equal(options.credentials, 'omit');
      assert.equal(options.cache, 'no-store');
      if (fail) throw new Error('Offline');
      return { ok: true, json: async () => status };
    },
    setInterval: (callback, delay) => { assert.equal(delay, 15000); tick = callback; },
    window: {
      location: { reload: () => { reloads++; } },
      parent: { postMessage() {} },
      addEventListener: (name, callback) => { events[name] = callback; }
    },
    document: {
      hidden: false,
      getElementById: id => elements[id],
      querySelectorAll: () => [modal],
      createElement: () => ({ setAttribute() {}, appendChild(child) { this.link = child; } }),
      body: { appendChild: element => { elements[element.id] = element; } },
      addEventListener: (name, callback) => { events[name] = callback; }
    }
  });
  vm.runInContext(monitor, context);
  context.setupEmbedAvailabilityMonitoring();
  await new Promise(setImmediate);
  assert.equal(dashboard.style.display, undefined);
  status = { estimatorActive: false, message: 'Unavailable <script>example</script>' };
  await tick();
  assert.equal(dashboard.style.display, 'none');
  assert.equal(modal.style.display, 'none');
  assert.equal(elements['embed-unavailable-notice'].textContent, status.message);
  assert.equal(elements['embed-unavailable-notice'].innerHTML, undefined, 'visitor messages must be plain text');
  status = { estimatorActive: true };
  await events.pageshow();
  assert.equal(reloads, 1);
  fail = true;
  await tick();
  assert.match(elements['embed-unavailable-notice'].textContent, /temporarily unavailable/);
  assert.equal(dashboard.style.display, 'none');
});
