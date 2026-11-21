const test = require('node:test');
const assert = require('node:assert');
const { slugDepuisHote } = require('../src/services/tenants');

test('quota : établissement déduit du nom de l\'adresse', () => {
  assert.strictEqual(slugDepuisHote('pau.sharedmoodle'), 'pau');
  assert.strictEqual(slugDepuisHote('Lycee-bayonne.sharedmoodle'), 'lycee-bayonne');
});

test('quota : adresses refusées', () => {
  assert.strictEqual(slugDepuisHote('pau.autre-domaine.fr'), null);
  assert.strictEqual(slugDepuisHote('sharedmoodle'), null);
  assert.strictEqual(slugDepuisHote('a.b.sharedmoodle'), null);
  assert.strictEqual(slugDepuisHote(''), null);
  assert.strictEqual(slugDepuisHote(undefined), null);
});
