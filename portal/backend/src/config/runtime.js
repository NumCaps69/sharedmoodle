const fs = require('fs');

function readSetting(name, { required = false, fallback } = {}) {
  const filePath = process.env[`${name}_FILE`];
  let value = process.env[name];

  if (filePath) {
    try {
      value = fs.readFileSync(filePath, 'utf8').trim();
    } catch (error) {
      throw new Error(`Impossible de lire le secret ${name} depuis ${filePath}: ${error.message}`);
    }
  }

  if (!value) value = fallback;
  if (required && !value) {
    throw new Error(`Configuration manquante: ${name} ou ${name}_FILE`);
  }

  return value;
}

function getJwtSecret() {
  const fallback = process.env.NODE_ENV === 'production'
    ? undefined
    : 'dev-secret-change-me';

  return readSetting('JWT_SECRET', { required: true, fallback });
}

function getDatabaseConfig() {
  const connectionString = readSetting('DATABASE_URL');
  if (connectionString) return { connectionString };

  return {
    host: readSetting('POSTGRES_HOST', { required: true }),
    port: Number(readSetting('POSTGRES_PORT', { fallback: '5432' })),
    database: readSetting('POSTGRES_DB', { required: true }),
    user: readSetting('POSTGRES_USER', { required: true }),
    password: readSetting('POSTGRES_PASSWORD', { required: true }),
  };
}

module.exports = { readSetting, getJwtSecret, getDatabaseConfig };
