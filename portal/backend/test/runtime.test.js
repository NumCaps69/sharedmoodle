const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readSetting, getJwtSecret, getDatabaseConfig } = require('../src/config/runtime');

const MANAGED_KEYS = [
  'NODE_ENV', 'JWT_SECRET', 'JWT_SECRET_FILE', 'DATABASE_URL',
  'POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_DB', 'POSTGRES_USER',
  'POSTGRES_PASSWORD', 'POSTGRES_PASSWORD_FILE',
];

function withCleanEnvironment(callback) {
  const previous = Object.fromEntries(MANAGED_KEYS.map((key) => [key, process.env[key]]));
  MANAGED_KEYS.forEach((key) => delete process.env[key]);

  try {
    callback();
  } finally {
    MANAGED_KEYS.forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
}

test('readSetting lit un secret Docker et supprime les espaces finaux', () => {
  withCleanEnvironment(() => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sharedmoodle-'));
    const secretPath = path.join(directory, 'jwt_secret');
    fs.writeFileSync(secretPath, 'secret-de-test\n');
    process.env.JWT_SECRET_FILE = secretPath;

    assert.equal(readSetting('JWT_SECRET', { required: true }), 'secret-de-test');
    fs.rmSync(directory, { recursive: true, force: true });
  });
});

test('getJwtSecret refuse le secret par défaut en production', () => {
  withCleanEnvironment(() => {
    process.env.NODE_ENV = 'production';
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);
  });
});

test('getDatabaseConfig construit la configuration depuis les secrets Docker', () => {
  withCleanEnvironment(() => {
    process.env.POSTGRES_HOST = 'postgres';
    process.env.POSTGRES_DB = 'sharedmoodle';
    process.env.POSTGRES_USER = 'smadmin';
    process.env.POSTGRES_PASSWORD = 'mot-de-passe';

    assert.deepEqual(getDatabaseConfig(), {
      host: 'postgres',
      port: 5432,
      database: 'sharedmoodle',
      user: 'smadmin',
      password: 'mot-de-passe',
    });
  });
});
