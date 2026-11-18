const test = require('node:test');
const assert = require('node:assert/strict');
const { PLANS, PLAN_ORDER, nextPlan, isUpgrade } = require('../src/config/plans');

test('les trois forfaits existent dans l\'ordre', () => {
  assert.deepEqual(PLAN_ORDER, ['FREE', 'GOLD', 'PLATINUM']);
  PLAN_ORDER.forEach((plan) => assert.ok(PLANS[plan]));
});

test('nextPlan propose le forfait supérieur', () => {
  assert.equal(nextPlan('FREE'), 'GOLD');
  assert.equal(nextPlan('GOLD'), 'PLATINUM');
  assert.equal(nextPlan('PLATINUM'), null);
});

test('isUpgrade refuse de descendre ou de rester au même niveau', () => {
  assert.equal(isUpgrade('FREE', 'PLATINUM'), true);
  assert.equal(isUpgrade('GOLD', 'GOLD'), false);
  assert.equal(isUpgrade('PLATINUM', 'GOLD'), false);
});
