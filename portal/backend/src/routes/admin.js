// ============================================================
// Administration de la plateforme (réservé aux comptes est_admin)
//
//   GET /api/admin/etablissements   liste : forfait, état du Moodle,
//                                   consommation, blocages, cours partagés
// Un compte devient admin seulement par scripts/make-admin.sh.
// ============================================================

const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { PLANS } = require('../config/plans');
const { provisionerEnabled, tenantStatus } = require('../services/tenants');
const { pourcentage } = require('../services/usage');

const router = express.Router();

// Le droit admin est relu en base à chaque requête : le retirer agit tout de suite
async function requireAdmin(req, res, next) {
  try {
    const { rows: [c] } = await db.query('SELECT est_admin, statut FROM clients WHERE id = $1', [req.user.id]);
    if (!c?.est_admin || c.statut !== 'ACTIVE') return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    next();
  } catch (err) {
    next(err);
  }
}

router.use(authMiddleware, requireAdmin);

// État réel de la pile, demandé au provisioner (2 s maximum par établissement)
async function etatPile(slug) {
  if (!provisionerEnabled()) return null;
  const delai = new Promise((resolve) => { setTimeout(() => resolve({ statut: 'INCONNU' }), 2000).unref(); });
  try {
    const etat = await Promise.race([tenantStatus(slug), delai]);
    return etat.exists === false ? 'ABSENT' : etat.statut;
  } catch {
    return 'INCONNU';
  }
}

// Résumé de la plateforme (fonction pure, testée)
function resumer(etablissements) {
  const parForfait = {};
  let revenuMensuel = 0;
  for (const e of etablissements) {
    parForfait[e.plan] = (parForfait[e.plan] || 0) + 1;
    if (e.statut === 'ACTIVE') revenuMensuel += PLANS[e.plan]?.prix || 0;
  }
  return {
    total: etablissements.length,
    parForfait,
    revenuMensuel: Math.round(revenuMensuel * 100) / 100,
    alertes: etablissements.filter((e) => e.alerte).length,
  };
}

router.get('/etablissements', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.organisation, c.nom, c.email, c.slug, c.plan, c.statut, c.created_at, c.est_admin,
              i.url, i.statut AS statut_moodle,
              co.nb_utilisateurs, co.nb_cours, co.stockage_utilise_mo, co.derniere_maj,
              l.max_utilisateurs, l.max_cours, l.stockage_go,
              (SELECT COUNT(*) FROM blocages b WHERE b.client_id = c.id) AS blocages,
              (SELECT COUNT(*) FROM cours_partages p WHERE p.client_id = c.id) AS cours_partages
       FROM clients c
       JOIN limites l ON l.plan = c.plan
       LEFT JOIN instances_moodle i ON i.client_id = c.id
       LEFT JOIN consommation co ON co.client_id = c.id
       ORDER BY c.created_at DESC`
    );
    const etats = await Promise.all(rows.map((r) => (r.url ? etatPile(r.slug) : null)));
    const etablissements = rows.map((r, i) => {
      const conso = {
        utilisateurs: { actuel: r.nb_utilisateurs ?? 0, max: r.max_utilisateurs, pourcentage: pourcentage(r.nb_utilisateurs ?? 0, r.max_utilisateurs) },
        cours: { actuel: r.nb_cours ?? 0, max: r.max_cours, pourcentage: pourcentage(r.nb_cours ?? 0, r.max_cours) },
        stockage: { utiliseMo: Number(r.stockage_utilise_mo ?? 0), maxGo: r.stockage_go, pourcentage: pourcentage(Number(r.stockage_utilise_mo ?? 0) / 1024, r.stockage_go) },
      };
      return {
        id: r.id,
        organisation: r.organisation,
        contact: { nom: r.nom, email: r.email },
        slug: r.slug,
        plan: r.plan,
        statut: r.statut,
        estAdmin: r.est_admin,
        creeLe: r.created_at,
        moodle: { url: r.url, statut: r.statut_moodle, etatPile: etats[i] },
        consommation: conso,
        derniereMesure: r.derniere_maj,
        blocages: Number(r.blocages),
        coursPartages: Number(r.cours_partages),
        alerte: Object.values(conso).some((m) => m.pourcentage >= 80),
      };
    });
    res.json({ resume: resumer(etablissements), etablissements });
  } catch (err) {
    console.error('Admin établissements :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
module.exports.resumer = resumer;
