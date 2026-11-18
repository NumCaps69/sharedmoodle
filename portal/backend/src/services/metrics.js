// ============================================================
// Métriques Prometheus de l'API (C1, C2).
//
// Servies sur un port séparé (METRICS_PORT, 9464 par défaut), joint
// seulement par Prometheus sur le réseau interne : ni Traefik ni le
// nginx du portail ne publient ce port.
//
// Par établissement (étiquette "tenant" = slug) :
//   sharedmoodle_tenant_info{tenant,plan,status} 1
//   sharedmoodle_tenant_users / _courses / _storage_mb        valeur mesurée
//   sharedmoodle_tenant_users_limit / _courses_limit / _storage_limit_mb
//   sharedmoodle_tenant_usage_ratio{resource}                 mesure / limite (absent si illimité)
//   sharedmoodle_tenant_blocked{type}                         utilisateurs suspendus, cours masqués
// Plus le trafic de l'API et la mémoire du processus.
// ============================================================

const http = require('http');
const db = require('../config/database');

const requetes = new Map(); // "GET 200" -> nombre

// Compte les requêtes HTTP de l'API (méthode et code de réponse),
// sans les tests de santé de Docker et Traefik
function compterRequetes(req, res, next) {
  if (req.path === '/api/health') return next();
  res.on('finish', () => {
    const cle = `${req.method} ${res.statusCode}`;
    requetes.set(cle, (requetes.get(cle) || 0) + 1);
  });
  next();
}

function echapper(valeur) {
  return String(valeur).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function ligne(nom, etiquettes, valeur) {
  const e = Object.entries(etiquettes).map(([k, v]) => `${k}="${echapper(v)}"`).join(',');
  return `${nom}${e ? `{${e}}` : ''} ${Number.isFinite(valeur) ? valeur : 0}`;
}

const AIDE = {
  sharedmoodle_tenant_info: ['gauge', 'Établissement : forfait et statut de son Moodle'],
  sharedmoodle_tenant_users: ['gauge', 'Utilisateurs actifs du Moodle'],
  sharedmoodle_tenant_users_limit: ['gauge', 'Utilisateurs autorisés par le forfait (-1 = illimité)'],
  sharedmoodle_tenant_courses: ['gauge', 'Cours visibles du Moodle'],
  sharedmoodle_tenant_courses_limit: ['gauge', 'Cours autorisés par le forfait (-1 = illimité)'],
  sharedmoodle_tenant_storage_mb: ['gauge', 'Stockage utilisé (Mo)'],
  sharedmoodle_tenant_storage_limit_mb: ['gauge', 'Stockage autorisé (Mo)'],
  sharedmoodle_tenant_usage_ratio: ['gauge', 'Consommation / limite du forfait (1 = limite atteinte)'],
  sharedmoodle_tenant_blocked: ['gauge', 'Éléments bloqués par le portail (utilisateurs suspendus, cours masqués)'],
  sharedmoodle_tenant_last_measure_timestamp_seconds: ['gauge', 'Date de la dernière mesure du Moodle'],
  sharedmoodle_http_requests_total: ['counter', "Requêtes HTTP reçues par l'API"],
  process_resident_memory_bytes: ['gauge', 'Mémoire utilisée par le processus'],
  process_uptime_seconds: ['gauge', 'Temps depuis le démarrage du processus'],
};

// Texte au format Prometheus à partir des lignes de la base (fonction pure, testée)
function render(etablissements, compteurs = new Map(), processus = {}) {
  const series = new Map(Object.keys(AIDE).map((nom) => [nom, []]));
  const ajouter = (nom, etiquettes, valeur) => series.get(nom).push(ligne(nom, etiquettes, valeur));

  for (const t of etablissements) {
    const base = { tenant: t.slug, plan: t.plan };
    ajouter('sharedmoodle_tenant_info', { ...base, status: t.statut }, 1);
    const ressources = [
      ['utilisateurs', 'users', Number(t.nb_utilisateurs), Number(t.max_utilisateurs)],
      ['cours', 'courses', Number(t.nb_cours), Number(t.max_cours)],
      ['stockage', 'storage', Number(t.stockage_utilise_mo), Number(t.stockage_go) * 1024],
    ];
    for (const [ressource, nom, actuel, max] of ressources) {
      const suffixe = nom === 'storage' ? '_mb' : '';
      ajouter(`sharedmoodle_tenant_${nom}${suffixe}`, base, actuel);
      ajouter(`sharedmoodle_tenant_${nom}_limit${suffixe}`, base, max < 0 ? -1 : max);
      if (max > 0) ajouter('sharedmoodle_tenant_usage_ratio', { ...base, resource: ressource }, Math.round((actuel / max) * 1000) / 1000);
    }
    ajouter('sharedmoodle_tenant_blocked', { ...base, type: 'utilisateur' }, Number(t.bloques_utilisateurs));
    ajouter('sharedmoodle_tenant_blocked', { ...base, type: 'cours' }, Number(t.bloques_cours));
    if (t.derniere_maj) ajouter('sharedmoodle_tenant_last_measure_timestamp_seconds', base, Math.floor(new Date(t.derniere_maj).getTime() / 1000));
  }
  for (const [cle, n] of compteurs) {
    const [method, status] = cle.split(' ');
    ajouter('sharedmoodle_http_requests_total', { method, status }, n);
  }
  if (processus.memoire !== undefined) ajouter('process_resident_memory_bytes', {}, processus.memoire);
  if (processus.uptime !== undefined) ajouter('process_uptime_seconds', {}, processus.uptime);

  const sortie = [];
  for (const [nom, lignes] of series) {
    if (!lignes.length) continue;
    const [type, aide] = AIDE[nom];
    sortie.push(`# HELP ${nom} ${aide}`, `# TYPE ${nom} ${type}`, ...lignes);
  }
  return `${sortie.join('\n')}\n`;
}

async function etablissements() {
  const { rows } = await db.query(
    `SELECT i.slug, c.plan, i.statut,
            COALESCE(co.nb_utilisateurs, 0) AS nb_utilisateurs,
            COALESCE(co.nb_cours, 0) AS nb_cours,
            COALESCE(co.stockage_utilise_mo, 0) AS stockage_utilise_mo,
            co.derniere_maj,
            l.max_utilisateurs, l.max_cours, l.stockage_go,
            (SELECT COUNT(*) FROM blocages b WHERE b.client_id = c.id AND b.type = 'utilisateur') AS bloques_utilisateurs,
            (SELECT COUNT(*) FROM blocages b WHERE b.client_id = c.id AND b.type = 'cours') AS bloques_cours
     FROM clients c
     JOIN instances_moodle i ON i.client_id = c.id
     JOIN limites l ON l.plan = c.plan
     LEFT JOIN consommation co ON co.client_id = c.id
     WHERE c.statut = 'ACTIVE'
     ORDER BY i.slug`
  );
  return rows;
}

function startMetricsServer(port) {
  const server = http.createServer(async (req, res) => {
    if (req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    try {
      const texte = render(await etablissements(), requetes, {
        memoire: process.memoryUsage().rss,
        uptime: Math.round(process.uptime()),
      });
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' }).end(texte);
    } catch (err) {
      console.error('Métriques indisponibles :', err.message);
      res.writeHead(500).end();
    }
  });
  // Un port déjà pris ne doit pas arrêter l'API : seules les métriques manquent
  server.on('error', (err) => console.error(`Métriques indisponibles (port ${port}) :`, err.message));
  server.listen(port, () => console.log(`Métriques Prometheus sur le port ${port} (/metrics)`));
  return server;
}

module.exports = { render, compterRequetes, startMetricsServer };
