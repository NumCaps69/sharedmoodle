const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');
const db = require('../config/database');
const { PLANS } = require('../config/plans');

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
  const { stackContent, dbPassword, adminPassword } = generateStackFile(slug, clientId, plan);

  // Sauvegarder le fichier de stack généré
  const stackDir = STACK_OUTPUT_DIR;
  if (!fs.existsSync(stackDir)) fs.mkdirSync(stackDir, { recursive: true });

  const stackFilePath = path.join(stackDir, `client-${slug}.yml`);
  fs.writeFileSync(stackFilePath, stackContent);

  const stackName = `sm-${slug}`;
  const url = `https://${slug}.${process.env.DOMAIN || 'sharedmoodle.fr'}`;

  if (process.env.NODE_ENV === 'production') {
    // Déployer vraiment sur Docker Swarm
    await new Promise((resolve, reject) => {
      exec(
        `docker stack deploy -c ${stackFilePath} ${stackName}`,
        (error, stdout, stderr) => {
          if (error) {
            console.error(`Erreur déploiement stack ${stackName}:`, stderr);
            reject(error);
          } else {
            console.log(`Stack ${stackName} déployée:`, stdout);
            resolve(stdout);
          }
        }
      );
    });
  } else {
    // Mode dev : simulation
    console.log(`[DEV] Simulation déploiement stack ${stackName}`);
    console.log(`[DEV] Fichier stack généré : ${stackFilePath}`);
  }

  // Enregistrer l'instance en BDD
  await db.query(
    `INSERT INTO instances_moodle (client_id, slug, url, docker_stack_name, statut)
     VALUES ($1, $2, $3, $4, $5)`,
    [clientId, slug, url, stackName, 'PROVISIONING']
  );

  // Initialiser la consommation à zéro
  await db.query(
    `INSERT INTO consommation (client_id, nb_utilisateurs, nb_cours, stockage_utilise_mo)
     VALUES ($1, 0, 0, 0)`,
    [clientId]
  );

  // Simuler le passage en RUNNING après 5 secondes (en prod, un health check le ferait)
  setTimeout(async () => {
    try {
      await db.query(
        `UPDATE instances_moodle SET statut = 'RUNNING' WHERE client_id = $1`,
        [clientId]
      );
      await db.query(
        `UPDATE clients SET statut = 'ACTIVE' WHERE id = $1`,
        [clientId]
      );
      console.log(`Instance ${slug} passée en RUNNING`);
    } catch (err) {
      console.error(`Erreur passage RUNNING pour ${slug}:`, err);
    }
  }, 5000);

  return { url, adminPassword, stackName };
}

/**
 * Met à jour les limites d'une instance après un upgrade
 */
async function updateInstanceLimits(clientId, newPlan) {
  const limits = PLANS[newPlan];

  // En production, on mettrait à jour les variables d'environnement du service Docker
  // et on forcerait un redéploiement
  if (process.env.NODE_ENV === 'production') {
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

      await new Promise((resolve, reject) => {
        exec(
          `docker stack deploy -c ${stackFilePath} ${docker_stack_name}`,
          (error, stdout) => {
            if (error) reject(error);
            else resolve(stdout);
          }
        );
      });
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
