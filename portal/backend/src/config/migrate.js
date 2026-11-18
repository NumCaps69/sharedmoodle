// ============================================================
// Création et mise à jour du schéma PostgreSQL au démarrage de l'API.
// En Swarm, un fichier monté depuis l'hôte n'existe que sur un nœud :
// l'API porte donc le schéma dans son image et l'applique elle-même.
// ============================================================

const fs = require('fs');
const path = require('path');
const db = require('./database');

const SCHEMA_FILE = path.join(__dirname, '..', '..', 'sql', 'init.sql');

// Mises à jour idempotentes, appliquées à chaque démarrage
const UPGRADES = [
  "ALTER TYPE plan_type ADD VALUE IF NOT EXISTS 'PLATINUM'",
  `INSERT INTO limites (plan, max_utilisateurs, max_cours, stockage_go, plugins_custom, frequence_backup, support_delai)
   VALUES ('PLATINUM', 5000, -1, 100, TRUE, 'toutes les 6h', '1h')
   ON CONFLICT (plan) DO NOTHING`,
  // Historique de consommation (rapport d'usage)
  `CREATE TABLE IF NOT EXISTS consommation_historique (
     id                  BIGSERIAL PRIMARY KEY,
     client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     nb_utilisateurs     INTEGER NOT NULL,
     nb_cours            INTEGER NOT NULL,
     stockage_utilise_mo DECIMAL(10,2) NOT NULL,
     date                TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE INDEX IF NOT EXISTS idx_conso_hist_client_date ON consommation_historique(client_id, date)',
  // Ce que le portail a bloqué dans Moodle pour respecter le forfait (rétabli si la limite remonte)
  `CREATE TABLE IF NOT EXISTS blocages (
     client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     type       VARCHAR(20) NOT NULL,
     moodle_id  BIGINT NOT NULL,
     date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (client_id, type, moodle_id)
   )`,
  // Administrateurs de la plateforme (donné par scripts/make-admin.sh, jamais à l'inscription)
  'ALTER TABLE clients ADD COLUMN IF NOT EXISTS est_admin BOOLEAN NOT NULL DEFAULT FALSE',
  // Catalogue de cours partagés entre établissements (sauvegardes Moodle .mbz)
  `CREATE TABLE IF NOT EXISTS cours_partages (
     id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     titre            VARCHAR(150) NOT NULL,
     description      TEXT NOT NULL DEFAULT '',
     discipline       VARCHAR(60) NOT NULL DEFAULT '',
     niveau           VARCHAR(60) NOT NULL DEFAULT '',
     licence          VARCHAR(30) NOT NULL,
     nom_fichier      VARCHAR(200) NOT NULL,
     taille_octets    INTEGER NOT NULL,
     sha256           CHAR(64) NOT NULL,
     fichier          BYTEA NOT NULL,
     telechargements  INTEGER NOT NULL DEFAULT 0,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE INDEX IF NOT EXISTS idx_cours_partages_date ON cours_partages(created_at DESC)',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// En Swarm, PostgreSQL peut démarrer après l'API : on réessaie
async function waitForDatabase(retries = 20, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`PostgreSQL pas encore prêt (${attempt}/${retries}) : ${err.message}`);
      await sleep(delayMs);
    }
  }
  throw new Error('PostgreSQL injoignable');
}

// Plusieurs copies de l'API peuvent démarrer en même temps :
// un verrou PostgreSQL garantit qu'une seule applique le schéma.
const MIGRATION_LOCK = 4242;

async function migrate() {
  await waitForDatabase();

  const conn = await db.pool.connect();
  try {
    await conn.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);

    const { rows } = await conn.query("SELECT to_regclass('public.clients') AS existe");
    if (!rows[0].existe) {
      console.log('Schéma absent : création des tables');
      await conn.query(fs.readFileSync(SCHEMA_FILE, 'utf8'));
    }

    for (const sql of UPGRADES) {
      await conn.query(sql);
    }
    console.log('Schéma PostgreSQL à jour');
  } finally {
    await conn.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {});
    conn.release();
  }
}

module.exports = { migrate };
