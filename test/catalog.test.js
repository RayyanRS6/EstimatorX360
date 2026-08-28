'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ADMIN_PASSWORD = 'test-admin-password-12345';
process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
process.env.FIREBASE_PROJECT_ID = 'priceguide-test';

const { validateCategories, validateServices } = require('../server.js');

const baseService = {
  id: 'kitchen-renovation',
  title: 'Kitchen Renovation',
  icon: 'kitchen',
  baseCost: 5000,
  questions: []
};

test('legacy forms migrate into the Residential category', () => {
  const services = validateServices([baseService], [{ id: 'residential', name: 'Residential' }]);
  assert.deepEqual(services[0].categoryIds, ['residential']);
});

test('forms may belong to multiple categories or no category', () => {
  const categories = validateCategories([
    { id: 'residential', name: 'Residential' },
    { id: 'premium', name: 'Premium Projects' }
  ]);
  assert.ok(categories);
  assert.deepEqual(validateServices([{ ...baseService, categoryIds: ['residential', 'premium'] }], categories)[0].categoryIds, ['residential', 'premium']);
  assert.deepEqual(validateServices([{ ...baseService, categoryIds: [] }], categories)[0].categoryIds, []);
});

test('unknown category assignments and duplicate category names are rejected', () => {
  const categories = [{ id: 'residential', name: 'Residential' }];
  assert.equal(validateServices([{ ...baseService, categoryIds: ['unknown'] }], categories), null);
  assert.equal(validateCategories([
    { id: 'residential', name: 'Residential' },
    { id: 'homes', name: ' residential ' }
  ]), null);
});
