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

test('generateSlug coupe à 40 caractères sans tiret final', () => {
  const slug = generateSlug('Lycée polyvalent régional de la Côte Basque Bayonne Anglet Biarritz');
  assert.ok(slug.length <= 40);
  assert.doesNotMatch(slug, /-$/);
});
