const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
const { generateSlug } = require('../src/services/provisioning');

test('generateSlug normalise les accents et caractères spéciaux', () => {
  assert.equal(generateSlug('École Supérieure de Paris'), 'ecole-superieure-de-paris');
});

test('generateSlug fournit une valeur sûre pour un nom sans caractères latins', () => {
  assert.equal(generateSlug('🎓'), 'organisation');
});

test('generateSlug limite le sous-domaine à 50 caractères', () => {
  assert.equal(generateSlug('a'.repeat(70)).length, 50);
});
