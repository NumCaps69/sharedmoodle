// ============================================================
// Mesure de la consommation réelle dans la base Moodle (MariaDB)
// et calcul des alertes de limite.
//
// Aujourd'hui tous les clients partagent le même Moodle : ils voient
// donc les mêmes chiffres. Avec un Moodle par client (étape D3),
// seule la connexion changera (une base par instance).
// ============================================================

const mysql = require('mysql2/promise');
const db = require('../config/database');
const { readSetting } = require('../config/runtime');
const { nextPlan } = require('../config/plans');

const ALERTE_SEUIL = 80; // % : avertissement
let moodlePool = null;

function getMoodlePool() {
  const host = readSetting('MOODLE_DB_HOST');
  if (!host) return null; // mesure désactivée : on garde les valeurs stockées

  if (!moodlePool) {
    moodlePool = mysql.createPool({
      host,
      port: Number(readSetting('MOODLE_DB_PORT', { fallback: '3306' })),
      database: readSetting('MOODLE_DB_NAME', { fallback: 'moodle' }),
      user: readSetting('MOODLE_DB_USER', { fallback: 'moodle' }),
      password: readSetting('MOODLE_DB_PASSWORD', { required: true }),
      connectionLimit: 3,
      connectTimeout: 3000,
    });
  }
  return moodlePool;
}

function prefix() {
  const value = readSetting('MOODLE_DB_PREFIX', { fallback: 'mdl_' });
  if (!/^[a-z0-9_]+$/i.test(value)) throw new Error('MOODLE_DB_PREFIX invalide');
  return value;
}

// Compte les utilisateurs, les cours et le stockage dans Moodle
async function measureMoodle() {
  const pool = getMoodlePool();
  if (!pool) return null;
  const p = prefix();

  const [[users]] = await pool.query(
    `SELECT COUNT(*) AS n FROM ${p}user WHERE deleted = 0 AND username <> 'guest'`
  );
  const [[courses]] = await pool.query(
    `SELECT COUNT(*) AS n FROM ${p}course WHERE format <> 'site'`
  );
  // Un même fichier (contenthash) n'est stocké qu'une fois sur le disque
  const [[files]] = await pool.query(
    `SELECT COALESCE(SUM(filesize), 0) AS octets
     FROM (SELECT DISTINCT contenthash, filesize FROM ${p}files WHERE filesize > 0) f`
  );

  return {
    nbUtilisateurs: Number(users.n),
    nbCours: Number(courses.n),
    stockageMo: Number(files.octets) / (1024 * 1024),
  };
}

// Met à jour la table consommation du client ; garde l'ancienne valeur si Moodle est injoignable
async function refreshConsumption(clientId) {
  try {
    const mesure = await measureMoodle();
    if (!mesure) return false;
    await db.query(
      `UPDATE consommation
       SET nb_utilisateurs = $2, nb_cours = $3, stockage_utilise_mo = $4, derniere_maj = NOW()
       WHERE client_id = $1`,
      [clientId, mesure.nbUtilisateurs, mesure.nbCours, mesure.stockageMo.toFixed(2)]
    );
    return true;
  } catch (err) {
    console.error('Mesure Moodle impossible :', err.message);
    return false;
  }
}

function pourcentage(actuel, max) {
  if (max === -1 || !max) return 0; // illimité
  return Math.round((actuel / max) * 100);
}

// Alertes à afficher et forfait proposé
function computeAlerts(plan, conso) {
  const alertes = [];
  for (const [nom, mesure] of Object.entries(conso)) {
    if (typeof mesure.pourcentage !== 'number') continue;
    if (mesure.pourcentage >= 100) {
      alertes.push({ niveau: 'limite', ressource: nom, message: `Limite atteinte : ${nom}` });
    } else if (mesure.pourcentage >= ALERTE_SEUIL) {
      alertes.push({ niveau: 'avertissement', ressource: nom, message: `${nom} à ${mesure.pourcentage} % de la limite` });
    }
  }
  const suivant = nextPlan(plan);
  return {
    alertes,
    miseANiveau: alertes.length > 0 && suivant ? suivant : null,
  };
}

module.exports = { measureMoodle, refreshConsumption, computeAlerts, pourcentage, ALERTE_SEUIL };
