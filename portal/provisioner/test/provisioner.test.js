const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TENANT_MASTER_KEY = 'cle-de-test';
const { tenantDbPassword, validSlug, PLAN_RESOURCES } = require('../src/index');

test('validSlug accepte un identifiant simple et refuse les noms réservés', () => {
  assert.equal(validSlug('lycee-pau'), true);
  assert.equal(validSlug('api'), false);
  assert.equal(validSlug('Pau'), false);
  assert.equal(validSlug('-pau'), false);
  assert.equal(validSlug('a;rm -rf'), false);
});

test('le mot de passe de base est stable et propre à chaque établissement', () => {
  assert.equal(tenantDbPassword('pau'), tenantDbPassword('pau'));
  assert.notEqual(tenantDbPassword('pau'), tenantDbPassword('bayonne'));
  assert.match(tenantDbPassword('pau'), /^[0-9a-f]{64}$/);
});

test('chaque forfait a ses ressources', () => {
  assert.deepEqual(Object.keys(PLAN_RESOURCES), ['FREE', 'GOLD', 'PLATINUM']);
});

test('sans NFS_ADDR, la pile utilise seulement tenant-stack.yml', () => {
  const { deployArgs } = require('../src/index');
  const args = deployArgs('pau');
  assert.equal(args.filter((a) => a === '-c').length, 1);
  assert.equal(args.at(-1), 'sm-pau');
  assert.equal(deployArgs('pau', 'nfs').filter((a) => a === '-c').length, 2);
});
