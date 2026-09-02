'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('share links wrap fully and the bottom sidebar action signs out', () => {
  const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

  assert.match(dashboard, /aria-label="Sign out" onclick="adminLogout\(\)"/);
  assert.doesNotMatch(dashboard, /Help \/ Documentation/);
  assert.match(app, /class="share-link-display" id="share-link-text"/);
  assert.match(app, /shareLink\.textContent = getEmbedUrl\(scope\)/);
  assert.match(styles, /\.share-link-display[\s\S]*overflow-wrap: anywhere/);
});

test('option price inputs coordinate valid ranges and catalog saves are serialized', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

  assert.match(app, /data-price-kind="min"/);
  assert.match(app, /data-price-kind="max"/);
  assert.match(app, /if \(option\.maxPrice < option\.minPrice\)/);
  assert.match(app, /if \(option\.minPrice > option\.maxPrice\)/);
  assert.match(app, /catalogSaveQueue\.then\(performSave, performSave\)/);
});
