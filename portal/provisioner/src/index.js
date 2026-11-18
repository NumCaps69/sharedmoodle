// ============================================================
// SharedMoodle — Provisioner
// Seul service qui pilote Docker (socket du manager Swarm).
// L'API publique ne touche jamais Docker : elle appelle ce service
// sur le réseau interne, avec un jeton partagé (Docker secret).
//
//   POST   /tenants              { slug, plan, email, name, adminPassword }
//   PUT    /tenants/:slug/plan   { plan }
//   GET    /tenants/:slug        état de la pile
//   GET    /tenants              liste des établissements
//   DELETE /tenants/:slug        supprime la pile et ses secrets (pas les volumes)
//   GET    /health
// ============================================================

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 4000);
const TEMPLATE = process.env.TENANT_TEMPLATE || path.join(__dirname, '..', 'tenant-stack.yml');
const DOMAIN = process.env.TENANT_DOMAIN || 'sharedmoodle';
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED = new Set(['api', 'portail', 'www', 'traefik', 'portainer', 'admin', 'grafana', 'prometheus', 'sharedmoodle']);

// Ressources par forfait : le passage à un forfait supérieur = scalabilité verticale
const PLAN_RESOURCES = {
  FREE: { MOODLE_CPU: '0.5', MOODLE_MEM: '768M', DB_CPU: '0.25', DB_MEM: '384M' },
  GOLD: { MOODLE_CPU: '1.0', MOODLE_MEM: '1G', DB_CPU: '0.5', DB_MEM: '512M' },
  PLATINUM: { MOODLE_CPU: '2.0', MOODLE_MEM: '2G', DB_CPU: '1.0', DB_MEM: '1G' },
};

function readSecret(name) {
  const file = process.env[`${name}_FILE`];
  const value = file ? fs.readFileSync(file, 'utf8').trim() : process.env[name];
  if (!value) throw new Error(`Configuration manquante : ${name} ou ${name}_FILE`);
  return value;
}

const cache = {};
const secret = (name) => (cache[name] ??= readSecret(name));

// Mot de passe de la base d'un établissement, recalculable par l'API
// avec la même clé maîtresse : aucun mot de passe par client à stocker.
function tenantDbPassword(slug) {
  return crypto.createHmac('sha256', secret('TENANT_MASTER_KEY')).update(`db:${slug}`).digest('hex');
}

function run(args, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { env: { ...process.env, ...env } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `docker ${args[0]} : code ${code}`))));
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function secretExists(name) {
  try { await run(['secret', 'inspect', name]); return true; } catch { return false; }
}

async function ensureSecret(name, value) {
  if (await secretExists(name)) return false;
  await run(['secret', 'create', name, '-'], { input: value });
  return true;
}

function stackEnv(slug, plan, email, name) {
  return {
    TENANT: slug,
    PLAN: plan,
    TENANT_EMAIL: email,
    TENANT_NAME: name,
    TENANT_DOMAIN: DOMAIN,
    ...PLAN_RESOURCES[plan],
    ...(process.env.APP_CONSTRAINT ? { APP_CONSTRAINT: process.env.APP_CONSTRAINT } : {}),
    ...(process.env.DB_CONSTRAINT ? { DB_CONSTRAINT: process.env.DB_CONSTRAINT } : {}),
    ...(process.env.MOODLE_IMAGE ? { MOODLE_IMAGE: process.env.MOODLE_IMAGE } : {}),
  };
}

async function readLabels(slug) {
  try {
    const raw = await run(['service', 'inspect', '-f', '{{json .Spec.Labels}}', `sm-${slug}_moodle`]);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function deployTenant({ slug, plan, email, name }) {
  await run(['stack', 'deploy', '--detach=true', '-c', TEMPLATE, `sm-${slug}`], { env: stackEnv(slug, plan, email, name) });
}

// Moodle répond-il ? (le provisioner est sur le réseau proxy, comme Traefik)
function moodleAnswers(slug) {
  return new Promise((resolve) => {
    const req = http.get({ host: `sm-${slug}_moodle`, port: 8080, path: '/login/index.php', timeout: 4000 }, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function tenantStatus(slug) {
  const labels = await readLabels(slug);
  if (!labels) return { slug, exists: false };
  const replicas = await run(['service', 'ls', '--filter', `name=sm-${slug}_`, '--format', '{{.Name}} {{.Replicas}}']);
  const ready = await moodleAnswers(slug);
  return {
    slug,
    exists: true,
    plan: labels['sharedmoodle.plan'],
    url: `http://${slug}.${DOMAIN}`,
    services: replicas.split('\n').filter(Boolean),
    statut: ready ? 'RUNNING' : 'PROVISIONING',
  };
}

// ---------------------------------------------------------------- HTTP
function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  const given = Buffer.from(String(req.headers['x-provisioner-token'] || ''));
  const expected = Buffer.from(secret('PROVISIONER_TOKEN'));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 10_000) { reject(new Error('Corps trop grand')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('JSON invalide')); }
    });
  });
}

function validSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug) && !RESERVED.has(slug);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (!authorized(req)) return send(res, 401, { error: 'Jeton invalide' });

  if (parts[0] !== 'tenants') return send(res, 404, { error: 'Route inconnue' });
  const slug = parts[1];

  if (req.method === 'GET' && !slug) {
    const names = await run(['stack', 'ls', '--format', '{{.Name}}']);
    return send(res, 200, { tenants: names.split('\n').filter((n) => n.startsWith('sm-')).map((n) => n.slice(3)) });
  }
  if (slug !== undefined && !validSlug(slug)) return send(res, 400, { error: 'Identifiant invalide' });

  if (req.method === 'POST' && !slug) {
    const body = await readBody(req);
    const { plan = 'FREE', email, name, adminPassword } = body;
    if (!validSlug(body.slug)) return send(res, 400, { error: 'Identifiant invalide' });
    if (!PLAN_RESOURCES[plan]) return send(res, 400, { error: 'Forfait inconnu' });
    if (typeof email !== 'string' || typeof name !== 'string' || typeof adminPassword !== 'string' || adminPassword.length < 8) {
      return send(res, 400, { error: 'email, name et adminPassword (8 caractères min.) requis' });
    }
    await ensureSecret(`sm-${body.slug}_db_password`, tenantDbPassword(body.slug));
    await ensureSecret(`sm-${body.slug}_admin_password`, adminPassword);
    await deployTenant({ slug: body.slug, plan, email, name });
    console.log(`Établissement ${body.slug} déployé (${plan})`);
    return send(res, 202, { slug: body.slug, plan, url: `http://${body.slug}.${DOMAIN}`, statut: 'PROVISIONING' });
  }

  if (req.method === 'PUT' && parts[2] === 'plan') {
    const { plan } = await readBody(req);
    if (!PLAN_RESOURCES[plan]) return send(res, 400, { error: 'Forfait inconnu' });
    const labels = await readLabels(slug);
    if (!labels) return send(res, 404, { error: 'Établissement inconnu' });
    const env = await run(['service', 'inspect', '-f', '{{json .Spec.TaskTemplate.ContainerSpec.Env}}', `sm-${slug}_moodle`]);
    const vars = Object.fromEntries(JSON.parse(env).map((e) => [e.split('=')[0], e.slice(e.indexOf('=') + 1)]));
    await deployTenant({ slug, plan, email: vars.MOODLE_EMAIL, name: vars.MOODLE_SITE_NAME });
    console.log(`Établissement ${slug} : forfait ${plan}`);
    return send(res, 200, { slug, plan, ressources: PLAN_RESOURCES[plan] });
  }

  if (req.method === 'GET' && slug) return send(res, 200, await tenantStatus(slug));

  if (req.method === 'DELETE' && slug) {
    await run(['stack', 'rm', `sm-${slug}`]).catch(() => {});
    // Les secrets ne peuvent être supprimés qu'une fois les services arrêtés
    for (let i = 0; i < 10; i += 1) {
      try {
        await run(['secret', 'rm', `sm-${slug}_db_password`, `sm-${slug}_admin_password`]);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    return send(res, 200, { slug, supprime: true, note: 'Les volumes restent sur les nœuds' });
  }

  return send(res, 404, { error: 'Route inconnue' });
}

if (require.main === module) {
  secret('PROVISIONER_TOKEN');
  secret('TENANT_MASTER_KEY');
  http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error('Erreur :', err.message);
      send(res, 500, { error: err.message });
    });
  }).listen(PORT, () => console.log(`Provisioner sur le port ${PORT}`));
}

module.exports = { tenantDbPassword, validSlug, PLAN_RESOURCES };
