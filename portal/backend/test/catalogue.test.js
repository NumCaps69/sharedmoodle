const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ||= 'secret-de-test';
const { validerMeta, verifierArchive, nomSur, versJsonLd } = require('../src/services/catalogue');
const { resumer } = require('../src/routes/admin');

const gzip = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00]);

test('validerMeta exige un titre et une licence connue', () => {
  assert.match(validerMeta({ titre: 'ab', licence: 'CC BY 4.0' }).erreur, /Titre/);
  assert.match(validerMeta({ titre: 'Algèbre', licence: 'MIT' }).erreur, /Licence/);
  const { meta } = validerMeta({ titre: '  Algèbre L1 ', licence: 'CC BY-SA 4.0', discipline: 'Maths' });
  assert.equal(meta.titre, 'Algèbre L1');
  assert.equal(meta.discipline, 'Maths');
});

test("verifierArchive n'accepte qu'une sauvegarde Moodle", () => {
  assert.equal(verifierArchive(gzip, 'cours.mbz'), null);
  assert.equal(verifierArchive(Buffer.from('PK\x03\x04'), 'ancien.MBZ'), null);
  assert.match(verifierArchive(gzip, 'cours.zip'), /\.mbz/);
  assert.match(verifierArchive(Buffer.from('<?php'), 'cours.mbz'), /valide/);
  assert.match(verifierArchive(Buffer.alloc(0), 'cours.mbz'), /vide/);
});

test('nomSur retire les chemins, accents et caractères dangereux', () => {
  assert.equal(nomSur('../../etc/passwd'), 'passwd');
  assert.equal(nomSur('Géométrie "test".mbz'), 'Geometrie_test_.mbz');
  assert.equal(nomSur(''), 'cours.mbz');
});

test('versJsonLd publie un catalogue schema.org sans données personnelles', () => {
  const ld = versJsonLd([{
    id: 'abc', titre: 'Algèbre', description: 'Cours', discipline: 'Maths', niveau: 'L1',
    licence: 'CC BY 4.0', organisation: 'Lycée de Pau', created_at: '2026-11-18T10:00:00Z',
    taille_octets: 1200, telechargements: '3', email: 'secret@pau.fr',
  }], 'http://portail.sharedmoodle');
  assert.equal(ld['@type'], 'DataCatalog');
  assert.equal(ld.dataset[0]['@type'], 'Course');
  assert.equal(ld.dataset[0].license, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(ld.dataset[0].interactionStatistic.userInteractionCount, 3);
  assert.doesNotMatch(JSON.stringify(ld), /secret@pau\.fr/);
});

test('resumer compte les établissements par forfait et le revenu des comptes actifs', () => {
  const r = resumer([
    { plan: 'FREE', statut: 'ACTIVE', alerte: true },
    { plan: 'GOLD', statut: 'ACTIVE', alerte: false },
    { plan: 'PLATINUM', statut: 'SUSPENDED', alerte: false },
  ]);
  assert.deepEqual(r.parForfait, { FREE: 1, GOLD: 1, PLATINUM: 1 });
  assert.equal(r.revenuMensuel, 29.99);
  assert.equal(r.alertes, 1);
});
