const db = require('../config/database');

function generateSlug(organisation) {
  const slug = organisation
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .substring(0, 40)
    .replace(/^-+|-+$/g, '');

  return slug || 'organisation';
}

// Sous-domaines déjà utilisés par la plateforme
const RESERVED_SLUGS = new Set(['api', 'portail', 'www', 'traefik', 'portainer', 'admin', 'grafana', 'prometheus', 'sharedmoodle']);

async function findUniqueSlug(organisation) {
  const slug = generateSlug(organisation);
  let candidate = slug;
  let counter = 1;

  while (true) {
    const result = await db.query('SELECT id FROM clients WHERE slug = $1', [candidate]);
    if (result.rows.length === 0 && !RESERVED_SLUGS.has(candidate)) return candidate;
    candidate = `${slug}-${counter}`;
    counter += 1;
  }
}

module.exports = { generateSlug, findUniqueSlug, RESERVED_SLUGS };
