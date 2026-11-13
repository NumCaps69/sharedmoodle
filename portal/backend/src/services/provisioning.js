const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const db = require('../config/database');
const { PLANS } = require('../config/plans');
const execFileAsync = promisify(execFile);

const TEMPLATE_PATH = process.env.STACK_TEMPLATE_PATH
  || path.resolve(__dirname, '../../../../infra/templates/client-stack.yml.template');
const STACK_OUTPUT_DIR = process.env.STACK_OUTPUT_DIR
  || path.resolve(__dirname, '../../../../infra/stacks');

/**
 * Génère un slug à partir du nom d'organisation
 */
function generateSlug(organisation) {
  const slug = organisation
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // Supprimer les accents
    .replace(/[^a-z0-9]+/g, '-')      // Remplacer les caractères spéciaux par des tirets
    .replace(/^-+|-+$/g, '')           // Supprimer les tirets en début/fin
    .substring(0, 50);                  // Limiter la longueur

  return slug || 'organisation';
}

/**
 * Vérifie si un slug est disponible
 */
async function isSlugAvailable(slug) {
  const result = await db.query('SELECT id FROM clients WHERE slug = $1', [slug]);
  return result.rows.length === 0;
}

/**
 * Trouve un slug unique (ajoute un suffixe si besoin)
 */
async function findUniqueSlug(organisation) {
  let slug = generateSlug(organisation);
  let candidate = slug;
  let counter = 1;

  while (!(await isSlugAvailable(candidate))) {
    candidate = `${slug}-${counter}`;
    counter++;
  }

  return candidate;
}

/**
 * Génère le fichier docker-compose d'un client à partir du template
 */
function generateStackFile(slug, clientId, plan) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const limits = PLANS[plan];

  const dbPassword = crypto.randomBytes(16).toString('hex');
  const dbRootPassword = crypto.randomBytes(16).toString('hex');
  const adminPassword = crypto.randomBytes(12).toString('base64url');

  const stackContent = template
    .replace(/\{\{SLUG\}\}/g, slug)
    .replace(/\{\{CLIENT_ID\}\}/g, clientId)
    .replace(/\{\{DB_PASSWORD\}\}/g, dbPassword)
    .replace(/\{\{DB_ROOT_PASSWORD\}\}/g, dbRootPassword)
    .replace(/\{\{ADMIN_PASSWORD\}\}/g, adminPassword)
    .replace(/\{\{PLAN\}\}/g, plan)
    .replace(/\{\{MAX_USERS\}\}/g, String(limits.maxUtilisateurs))
    .replace(/\{\{MAX_COURSES\}\}/g, String(limits.maxCours))
    .replace(/\{\{MAX_STORAGE_MB\}\}/g, String(limits.stockageGo * 1024));

  return { stackContent, dbPassword, adminPassword };
}

/**
 * Déploie la stack Docker Swarm d'un client
 * En mode dev, simule le déploiement
 */
async function deployClientStack(clientId, slug, plan) {
  const { stackContent, adminPassword } = generateStackFile(slug, clientId, plan);

  // Sauvegarder le fichier de stack généré
  const stackDir = STACK_OUTPUT_DIR;
  if (!fs.existsSync(stackDir)) fs.mkdirSync(stackDir, { recursive: true });

  const stackFilePath = path.join(stackDir, `client-${slug}.yml`);
  fs.writeFileSync(stackFilePath, stackContent);

  const stackName = `sm-${slug}`;
  const url = `https://${slug}.${process.env.DOMAIN || 'sharedmoodle.fr'}`;

  // Enregistrer l'état avant l'appel à Docker pour rendre les erreurs visibles.
  await db.query(
    `INSERT INTO instances_moodle (client_id, slug, url, docker_stack_name, statut)
     VALUES ($1, $2, $3, $4, 'PROVISIONING')
     ON CONFLICT (client_id) DO UPDATE SET statut = 'PROVISIONING'`,
    [clientId, slug, url, stackName]
  );

  // Initialiser la consommation à zéro
  await db.query(
    `INSERT INTO consommation (client_id, nb_utilisateurs, nb_cours, stockage_utilise_mo)
     VALUES ($1, 0, 0, 0)
     ON CONFLICT (client_id) DO NOTHING`,
    [clientId]
  );

  const provisioningMode = process.env.PROVISIONING_MODE || 'simulate';

  try {
    if (provisioningMode === 'swarm') {
      const { stdout } = await execFileAsync(
        'docker',
        ['stack', 'deploy', '-c', stackFilePath, stackName]
      );
      console.log(`Stack ${stackName} déployée:`, stdout);
      monitorStack(clientId, slug, stackName).catch((error) => {
        console.error(`Monitoring impossible pour ${stackName}:`, error);
      });
    } else {
      console.log(`[DEV] Simulation déploiement stack ${stackName}`);
      setTimeout(() => markInstanceRunning(clientId, slug), 1000);
    }
  } catch (error) {
    await markInstanceError(clientId, error);
    throw error;
  }

  return { url, adminPassword, stackName };
}

async function markInstanceRunning(clientId, slug) {
  await db.query(
    `UPDATE instances_moodle SET statut = 'RUNNING' WHERE client_id = $1`,
    [clientId]
  );
  await db.query(`UPDATE clients SET statut = 'ACTIVE' WHERE id = $1`, [clientId]);
  console.log(`Instance ${slug} passée en RUNNING`);
}

async function markInstanceError(clientId, error) {
  await db.query(`UPDATE instances_moodle SET statut = 'ERROR' WHERE client_id = $1`, [clientId]);
  await db.query(
    `INSERT INTO logs_audit (client_id, action, details)
     VALUES ($1, 'PROVISIONING_ERROR', $2)`,
    [clientId, JSON.stringify({ message: error.message })]
  );
}

async function monitorStack(clientId, slug, stackName) {
  const attempts = Number(process.env.PROVISIONING_HEALTH_ATTEMPTS || 30);
  const intervalMs = Number(process.env.PROVISIONING_HEALTH_INTERVAL_MS || 10000);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const { stdout } = await execFileAsync(
      'docker',
      ['stack', 'services', stackName, '--format', '{{.Replicas}}']
    );
    const replicas = stdout.trim().split(/\r?\n/).filter(Boolean);

    if (replicas.length > 0 && replicas.every((value) => {
      const [running, desired] = value.split('/').map(Number);
      return desired > 0 && running === desired;
    })) {
      await markInstanceRunning(clientId, slug);
      return;
    }
  }

  const error = new Error(`Timeout de démarrage pour la stack ${stackName}`);
  await markInstanceError(clientId, error);
  throw error;
}

/**
 * Met à jour les limites d'une instance après un upgrade
 */
async function updateInstanceLimits(clientId, newPlan) {
  const limits = PLANS[newPlan];

  // En production, on mettrait à jour les variables d'environnement du service Docker
  // et on forcerait un redéploiement
  if ((process.env.PROVISIONING_MODE || 'simulate') === 'swarm') {
    const instance = await db.query(
      'SELECT docker_stack_name, slug FROM instances_moodle WHERE client_id = $1',
      [clientId]
    );

    if (instance.rows.length > 0) {
      const { docker_stack_name, slug } = instance.rows[0];
      // Regénérer et redéployer la stack avec les nouvelles limites
      const { stackContent } = generateStackFile(slug, clientId, newPlan);
      const stackDir = STACK_OUTPUT_DIR;
      const stackFilePath = path.join(stackDir, `client-${slug}.yml`);
      fs.writeFileSync(stackFilePath, stackContent);

      await execFileAsync('docker', [
        'stack', 'deploy', '-c', stackFilePath, docker_stack_name,
      ]);
    }
  } else {
    console.log(`[DEV] Mise à jour limites client ${clientId} -> ${newPlan}`);
  }

  // Log d'audit
  await db.query(
    `INSERT INTO logs_audit (client_id, action, details)
     VALUES ($1, 'UPGRADE_PLAN', $2)`,
    [clientId, JSON.stringify({ newPlan, limits })]
  );
}

module.exports = {
  generateSlug,
  findUniqueSlug,
  isSlugAvailable,
  deployClientStack,
  updateInstanceLimits,
};
