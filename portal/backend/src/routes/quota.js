// ============================================================
// Quota vu depuis le Moodle d'un établissement
//
// Traefik envoie à l'API les adresses <slug>.sharedmoodle/sm-quota/...
// Le Moodle de chaque établissement charge /sm-quota/widget.js (ajouté
// dans son config.php par la pile sm-<slug>) : dès qu'une page s'ouvre,
// le widget demande l'état du forfait et prévient l'administrateur
// (80 % puis 100 %), et bloque la création d'un cours ou d'un compte
// au-delà de la limite.
//
//   GET /sm-quota/status     consommation de l'établissement de l'adresse
//   GET /sm-quota/widget.js  script affiché dans Moodle
//
// L'établissement est déduit du nom de l'adresse : un Moodle ne voit
// que ses propres chiffres. Rien de personnel n'est renvoyé.
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const { readSetting } = require('../config/runtime');
const { refreshConsumption, confirmerInstancesPretes, pourcentage, ALERTE_SEUIL } = require('../services/usage');
const { nextPlan } = require('../config/plans');
const { slugDepuisHote } = require('../services/tenants');

const router = express.Router();
const WIDGET = fs.readFileSync(path.join(__dirname, '..', 'public', 'sm-quota-widget.js'), 'utf8');

// Une mesure par établissement toutes les 3 s au plus, même si beaucoup de pages s'ouvrent
const MESURE_MIN_MS = Number(process.env.QUOTA_REFRESH_MS || 3000);
const derniereMesure = new Map();

function ressource(actuel, max) {
  const illimite = max === -1;
  return {
    actuel: Number(actuel),
    max: illimite ? null : Number(max),
    pourcentage: illimite ? 0 : pourcentage(Number(actuel), Number(max)),
  };
}

router.get('/widget.js', (req, res) => {
  res.type('application/javascript').set('Cache-Control', 'public, max-age=60').send(WIDGET);
});

router.get('/status', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const slug = slugDepuisHote(req.hostname);
  if (!slug) return res.status(404).json({ error: 'Établissement inconnu' });
  try {
    const trouve = await db.query(
      `SELECT c.id FROM clients c JOIN instances_moodle i ON i.client_id = c.id
       WHERE i.slug = $1 AND c.statut = 'ACTIVE'`,
      [slug]
    );
    if (!trouve.rows.length) return res.status(404).json({ error: 'Établissement inconnu' });
    const clientId = trouve.rows[0].id;

    // Mesure fraîche (et limites appliquées) : la page reflète le cours qui vient d'être créé
    const maintenant = Date.now();
    if (maintenant - (derniereMesure.get(clientId) || 0) >= MESURE_MIN_MS) {
      derniereMesure.set(clientId, maintenant);
      await confirmerInstancesPretes(clientId);
      await refreshConsumption(clientId);
    }

    const { rows: [r] } = await db.query(
      `SELECT c.plan, co.nb_utilisateurs, co.nb_cours, l.max_utilisateurs, l.max_cours,
              (SELECT COUNT(*) FROM blocages b WHERE b.client_id = c.id AND b.type = 'cours') AS cours_bloques,
              (SELECT COUNT(*) FROM blocages b WHERE b.client_id = c.id AND b.type = 'utilisateur') AS utilisateurs_bloques
       FROM clients c
       JOIN consommation co ON co.client_id = c.id
       JOIN limites l ON l.plan = c.plan
       WHERE c.id = $1`,
      [clientId]
    );
    const portail = readSetting('PORTAL_URL', { fallback: `http://portail.${readSetting('TENANT_DOMAIN', { fallback: 'sharedmoodle' })}` });
    const suivant = nextPlan(r.plan);
    res.json({
      plan: r.plan,
      seuil: ALERTE_SEUIL,
      cours: { ...ressource(r.nb_cours, r.max_cours), bloques: Number(r.cours_bloques) },
      utilisateurs: { ...ressource(r.nb_utilisateurs, r.max_utilisateurs), bloques: Number(r.utilisateurs_bloques) },
      miseANiveau: suivant ? { plan: suivant, url: `${portail}/#upgrade/${suivant}` } : null,
    });
  } catch (err) {
    console.error('Quota Moodle :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
