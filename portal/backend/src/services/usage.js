// ============================================================
// Consommation de chaque établissement, mesurée dans SA base Moodle,
// et application des limites du forfait (D4, D5).
//
// - Établissement dédié (pile sm-<slug>) : base "sm-<slug>_db",
//   jointe par le réseau sm_admin, mot de passe dérivé de la clé maîtresse.
// - Lancement local sans provisioner : Moodle de démonstration (MOODLE_DB_*).
//
// Limites appliquées côté serveur, dans Moodle :
// - utilisateurs au-delà du forfait : les plus récents sont suspendus
// - cours au-delà du forfait : les plus récents sont masqués
// - stockage : alerte seulement
// Quand la limite remonte (passage à un forfait supérieur), ce qui a
// été bloqué par le portail est rétabli automatiquement.
// ============================================================

const mysql = require('mysql2/promise');
const db = require('../config/database');
const { readSetting } = require('../config/runtime');
const { nextPlan } = require('../config/plans');
const { provisionerEnabled, tenantDbConfig, tenantStatus } = require('./tenants');

const ALERTE_SEUIL = 80; // % : avertissement
const HISTORIQUE_MIN_SECONDES = 300; // une ligne d'historique toutes les 5 min max
const pools = new Map();

function poolFor(key, config) {
  if (!pools.has(key)) {
    pools.set(key, mysql.createPool({ ...config, connectionLimit: 2, connectTimeout: 3000 }));
  }
  return pools.get(key);
}

// Base Moodle d'un client (ou null si aucune mesure possible)
function moodlePoolFor(instance) {
  if (instance?.docker_stack_name && provisionerEnabled()) {
    return poolFor(instance.docker_stack_name, tenantDbConfig(instance.docker_stack_name, instance.slug));
  }
  const host = readSetting('MOODLE_DB_HOST');
  if (!host) return null;
  return poolFor('demo', {
    host,
    port: Number(readSetting('MOODLE_DB_PORT', { fallback: '3306' })),
    database: readSetting('MOODLE_DB_NAME', { fallback: 'moodle' }),
    user: readSetting('MOODLE_DB_USER', { fallback: 'moodle' }),
    password: readSetting('MOODLE_DB_PASSWORD', { required: true }),
  });
}

function prefix() {
  const value = readSetting('MOODLE_DB_PREFIX', { fallback: 'mdl_' });
  if (!/^[a-z0-9_]+$/i.test(value)) throw new Error('MOODLE_DB_PREFIX invalide');
  return value;
}

// Utilisateurs actifs, cours visibles et stockage
async function measureMoodle(pool) {
  const p = prefix();
  const [[users]] = await pool.query(
    `SELECT COUNT(*) AS n FROM ${p}user WHERE deleted = 0 AND suspended = 0 AND username <> 'guest'`
  );
  const [[courses]] = await pool.query(
    `SELECT COUNT(*) AS n FROM ${p}course WHERE format <> 'site' AND visible = 1`
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

// Combien bloquer (positif) ou rétablir (négatif) pour respecter la limite
function ecart(actuel, max) {
  if (max === -1) return -Infinity; // illimité : tout rétablir
  return actuel - max;
}

async function adminIds(pool) {
  const [[row]] = await pool.query(`SELECT value FROM ${prefix()}config WHERE name = 'siteadmins'`);
  return (row?.value || '').split(',').map(Number).filter(Boolean);
}

// Applique une limite sur une ressource ("utilisateur" ou "cours")
async function appliquerLimite(pool, clientId, type, actuel, max) {
  const p = prefix();
  const cfg = type === 'utilisateur'
    ? { table: `${p}user`, bloque: 'suspended = 1', libre: 'suspended = 0', actif: "deleted = 0 AND suspended = 0 AND username <> 'guest'" }
    : { table: `${p}course`, bloque: 'visible = 0', libre: 'visible = 1', actif: "format <> 'site' AND visible = 1" };
  const diff = ecart(actuel, max);
  const actions = [];

  if (diff > 0) {
    const exclus = type === 'utilisateur' ? await adminIds(pool) : [];
    const [rows] = await pool.query(
      `SELECT id FROM ${cfg.table} WHERE ${cfg.actif}${exclus.length ? ` AND id NOT IN (${exclus.map(() => '?').join(',')})` : ''}
       ORDER BY id DESC LIMIT ?`,
      [...exclus, diff]
    );
    for (const { id } of rows) {
      await pool.query(`UPDATE ${cfg.table} SET ${cfg.bloque} WHERE id = ?`, [id]);
      await db.query(
        'INSERT INTO blocages (client_id, type, moodle_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [clientId, type, id]
      );
      actions.push({ action: 'bloque', type, moodleId: id });
    }
  } else if (diff < 0) {
    // Place disponible : rétablir ce que le portail avait bloqué (les plus anciens d'abord)
    const place = diff === -Infinity ? null : -diff;
    const { rows } = await db.query(
      `SELECT moodle_id FROM blocages WHERE client_id = $1 AND type = $2 ORDER BY moodle_id ASC ${place ? 'LIMIT $3' : ''}`,
      place ? [clientId, type, place] : [clientId, type]
    );
    for (const { moodle_id: id } of rows) {
      await pool.query(`UPDATE ${cfg.table} SET ${cfg.libre} WHERE id = ?`, [id]);
      await db.query('DELETE FROM blocages WHERE client_id = $1 AND type = $2 AND moodle_id = $3', [clientId, type, id]);
      actions.push({ action: 'retabli', type, moodleId: id });
    }
  }
  return actions;
}

async function clientContext(clientId) {
  const { rows } = await db.query(
    `SELECT c.plan, i.slug, i.docker_stack_name, i.statut,
            l.max_utilisateurs, l.max_cours
     FROM clients c
     JOIN limites l ON l.plan = c.plan
     LEFT JOIN instances_moodle i ON i.client_id = c.id
     WHERE c.id = $1`,
    [clientId]
  );
  return rows[0];
}

// Mesure, applique les limites, enregistre ; garde l'ancienne valeur si Moodle est injoignable
async function refreshConsumption(clientId) {
  try {
    const ctx = await clientContext(clientId);
    if (!ctx || ctx.statut === 'PROVISIONING' || ctx.statut === 'ERROR') return { mesure: false, actions: [] };
    const pool = moodlePoolFor(ctx);
    if (!pool) return { mesure: false, actions: [] };

    // La démo est partagée par tous : on y mesure, mais on n'y bloque rien
    const dedie = Boolean(ctx.docker_stack_name && provisionerEnabled());
    let mesure = await measureMoodle(pool);
    let actions = [];
    if (dedie) {
      actions = [
        ...(await appliquerLimite(pool, clientId, 'utilisateur', mesure.nbUtilisateurs, ctx.max_utilisateurs)),
        ...(await appliquerLimite(pool, clientId, 'cours', mesure.nbCours, ctx.max_cours)),
      ];
      if (actions.length) {
        mesure = await measureMoodle(pool);
        await db.query(
          `INSERT INTO logs_audit (client_id, action, details) VALUES ($1, 'LIMITES_APPLIQUEES', $2)`,
          [clientId, JSON.stringify(actions)]
        );
      }
    }

    await db.query(
      `UPDATE consommation
       SET nb_utilisateurs = $2, nb_cours = $3, stockage_utilise_mo = $4, derniere_maj = NOW()
       WHERE client_id = $1`,
      [clientId, mesure.nbUtilisateurs, mesure.nbCours, mesure.stockageMo.toFixed(2)]
    );
    await db.query(
      `INSERT INTO consommation_historique (client_id, nb_utilisateurs, nb_cours, stockage_utilise_mo)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM consommation_historique
         WHERE client_id = $1 AND date > NOW() - make_interval(secs => $5)
       )`,
      [clientId, mesure.nbUtilisateurs, mesure.nbCours, mesure.stockageMo.toFixed(2), HISTORIQUE_MIN_SECONDES]
    );
    return { mesure: true, actions };
  } catch (err) {
    console.error(`Mesure Moodle impossible (client ${clientId}) :`, err.message);
    return { mesure: false, actions: [] };
  }
}

// Tous les clients actifs, régulièrement (limites appliquées même sans visite du portail)
async function refreshAll() {
  await confirmerInstancesPretes();
  const { rows } = await db.query(
    `SELECT c.id FROM clients c JOIN instances_moodle i ON i.client_id = c.id
     WHERE c.statut = 'ACTIVE' AND i.statut = 'RUNNING'`
  );
  for (const { id } of rows) await refreshConsumption(id);
}

// Moodle encore « en création » : demander au provisioner s'il répond, pour que
// la mesure (et les alertes) commencent même si le client n'a pas rouvert le portail
async function confirmerInstancesPretes(clientId = null) {
  if (!provisionerEnabled()) return;
  const { rows } = await db.query(
    `SELECT client_id, slug FROM instances_moodle
     WHERE statut = 'PROVISIONING' AND docker_stack_name IS NOT NULL AND ($1::uuid IS NULL OR client_id = $1)`,
    [clientId]
  );
  for (const { client_id: id, slug } of rows) {
    try {
      const etat = await tenantStatus(slug);
      if (etat.exists && etat.statut === 'RUNNING') {
        await db.query("UPDATE instances_moodle SET statut = 'RUNNING' WHERE client_id = $1", [id]);
      }
    } catch (err) {
      console.error(`État du Moodle ${slug} indisponible :`, err.message);
    }
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

module.exports = {
  measureMoodle, refreshConsumption, refreshAll, confirmerInstancesPretes, computeAlerts, pourcentage, ecart, ALERTE_SEUIL,
};
