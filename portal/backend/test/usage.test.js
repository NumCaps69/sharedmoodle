const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
const { computeAlerts, pourcentage } = require('../src/services/usage');

test('pourcentage renvoie 0 pour une limite illimitée', () => {
  assert.equal(pourcentage(10, -1), 0);
  assert.equal(pourcentage(45, 50), 90);
});

test('computeAlerts avertit à 80 % et propose le forfait supérieur', () => {
  const r = computeAlerts('FREE', {
    utilisateurs: { pourcentage: 90 },
    cours: { pourcentage: 100 },
    stockage: { pourcentage: 10 },
  });
  assert.deepEqual(r.alertes.map((a) => a.niveau), ['avertissement', 'limite']);
  assert.equal(r.miseANiveau, 'GOLD');
});

test('computeAlerts ne propose rien sans alerte ni au-dessus de PLATINUM', () => {
  assert.equal(computeAlerts('FREE', { utilisateurs: { pourcentage: 10 } }).miseANiveau, null);
  assert.equal(computeAlerts('PLATINUM', { utilisateurs: { pourcentage: 100 } }).miseANiveau, null);
});
