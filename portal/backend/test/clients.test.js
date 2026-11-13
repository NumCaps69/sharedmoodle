const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
const { generateSlug } = require('../src/services/clients');

test('generateSlug crée un sous-domaine simple', () => {
  assert.equal(generateSlug('École Supérieure de Paris'), 'ecole-superieure-de-paris');
});

test('generateSlug utilise une valeur par défaut', () => {
  assert.equal(generateSlug('🎓'), 'organisation');
});
