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

test('the kill switch banner stays invisible until it is shown', () => {
  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

  // .kill-switch-banner sets display:flex, which outranks the browser's built-in
  // [hidden] rule. Without this override the hidden banner renders as an empty
  // coloured bar above every view.
  assert.match(styles, /\.kill-switch-banner\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(dashboard, /id="global-kill-switch-banner"[^>]*hidden/);
});

test('the kill switch confirms destructive changes in-app, not with a browser dialog', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

  const start = app.indexOf('5. KILL SWITCH (BILLING CONTROL) LOGIC');
  const end = app.indexOf('function setupEmbeddedHeightMessaging');
  assert.ok(start > -1 && end > start);
  const killSwitchCode = app.slice(start, end);

  assert.doesNotMatch(killSwitchCode, /window\.(confirm|alert|prompt)\s*\(/);
  assert.match(killSwitchCode, /function openKillSwitchConfirm/);
  assert.match(dashboard, /id="kill-switch-confirm-modal"/);
  assert.match(dashboard, /id="kill-switch-confirm-accept"/);
});

test('the kill switch is reachable from the sidebar icon only, not the top navbar', () => {
  const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

  assert.match(dashboard, /class="icon-btn sidebar-nav-btn" data-view="kill-switch"/);
  assert.doesNotMatch(dashboard, /class="nav-link"[^>]*data-view="kill-switch"/);
});

test('no stale duplicate copies of the browser assets are left to be served instead', () => {
  // dashboard.html only exists at the project root, so the root copies of app.js and
  // styles.css are the source of truth. A public/ duplicate that drifts out of date gets
  // served in their place on some host layouts, which silently reverts frontend edits.
  for (const filename of ['app.js', 'styles.css', 'login.html']) {
    const duplicate = path.join(root, 'public', filename);
    if (!fs.existsSync(duplicate)) continue;
    assert.equal(
      fs.readFileSync(duplicate, 'utf8'),
      fs.readFileSync(path.join(root, filename), 'utf8'),
      `public/${filename} has drifted from the root ${filename}. Delete the public/ copies, or re-sync them.`
    );
  }
});

test('the project root takes priority over any legacy public/ duplicate', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const candidates = server.slice(server.indexOf('function getFrontendFilePath'));
  const rootIndex = candidates.indexOf("path.join(__dirname, filename)");
  const publicIndex = candidates.indexOf("path.join(__dirname, 'public', filename)");

  assert.ok(rootIndex > -1 && publicIndex > -1);
  assert.ok(rootIndex < publicIndex, 'the root file must be resolved before the public/ copy');
});
