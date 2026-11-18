const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { PLANS, isUpgrade, TEST_CARD } = require('../config/plans');
const { refreshConsumption, computeAlerts, pourcentage } = require('../services/usage');

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authMiddleware);

// ============================================================
// GET /api/subscription — Mon abonnement actuel
// ============================================================
router.get('/', async (req, res) => {
  try {
    const client = await db.query(
      `SELECT c.id, c.plan, c.statut, c.organisation, c.slug,
              a.date_debut, a.date_fin,
              l.max_utilisateurs, l.max_cours, l.stockage_go,
              l.plugins_custom, l.frequence_backup, l.support_delai
       FROM clients c
       JOIN abonnements a ON a.client_id = c.id AND a.actif = TRUE
       JOIN limites l ON l.plan = c.plan
       WHERE c.id = $1`,
      [req.user.id]
    );

    if (client.rows.length === 0) {
      return res.status(404).json({ error: 'Abonnement non trouvé' });
    }

    res.json({ abonnement: client.rows[0] });
  } catch (err) {
    console.error('Erreur récupération abonnement:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// GET /api/subscription/consumption — Ma consommation
// Mesurée dans Moodle à chaque appel, avec alertes de limite
// ============================================================
router.get('/consumption', async (req, res) => {
  try {
    const mesureAJour = await refreshConsumption(req.user.id);

    const result = await db.query(
      `SELECT co.nb_utilisateurs, co.nb_cours, co.stockage_utilise_mo, co.derniere_maj,
              c.plan, l.max_utilisateurs, l.max_cours, l.stockage_go
       FROM consommation co
       JOIN clients c ON c.id = co.client_id
       JOIN limites l ON l.plan = c.plan
       WHERE co.client_id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Données de consommation non trouvées' });
    }

    const data = result.rows[0];
    const stockageMo = parseFloat(data.stockage_utilise_mo);
    const consommation = {
      utilisateurs: {
        actuel: data.nb_utilisateurs,
        max: data.max_utilisateurs,
        pourcentage: pourcentage(data.nb_utilisateurs, data.max_utilisateurs),
      },
      cours: {
        actuel: data.nb_cours,
        max: data.max_cours === -1 ? 'Illimité' : data.max_cours,
        pourcentage: pourcentage(data.nb_cours, data.max_cours),
      },
      stockage: {
        utiliseMo: stockageMo,
        maxGo: data.stockage_go,
        pourcentage: pourcentage(stockageMo, data.stockage_go * 1024),
      },
    };

    res.json({
      consommation: {
        ...consommation,
        derniereMaj: data.derniere_maj,
        source: mesureAJour ? 'moodle' : 'derniere-mesure',
      },
      ...computeAlerts(data.plan, consommation),
    });
  } catch (err) {
    console.error('Erreur récupération consommation:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// POST /api/subscription/upgrade — Passer à un forfait supérieur
// Corps : { numeroCarte, plan } ; plan = GOLD (défaut) ou PLATINUM
// ============================================================
router.post(
  '/upgrade',
  [
    body('numeroCarte')
      .trim()
      .notEmpty()
      .withMessage('Numéro de carte requis'),
    body('plan')
      .optional()
      .isIn(['GOLD', 'PLATINUM'])
      .withMessage('Forfait inconnu'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { numeroCarte } = req.body;
    const cible = req.body.plan || 'GOLD';
    const clientId = req.user.id;

    try {
      // Le forfait actuel est lu en base : le client ne peut pas le falsifier
      const clientResult = await db.query(
        'SELECT plan FROM clients WHERE id = $1',
        [clientId]
      );

      if (clientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Client non trouvé' });
      }

      const actuel = clientResult.rows[0].plan;
      if (!isUpgrade(actuel, cible)) {
        return res.status(400).json({ error: `Vous êtes déjà en ${actuel} : choisissez un forfait supérieur` });
      }

      // Nettoyer le numéro de carte (retirer les espaces)
      const carteNettoyee = numeroCarte.replace(/\s+/g, '');

      // Vérifier la carte de test
      const carteAcceptee = carteNettoyee === TEST_CARD;

      // Masquer le numéro pour le stockage
      const carteMasquee = `${carteNettoyee.slice(0, 4)} **** **** ${carteNettoyee.slice(-4)}`;
      const motif = `Upgrade ${actuel} -> ${cible}`;

      // Enregistrer le paiement
      await db.query(
        `INSERT INTO paiements (client_id, montant, numero_carte, statut, motif)
         VALUES ($1, $2, $3, $4, $5)`,
        [clientId, PLANS[cible].prix, carteMasquee, carteAcceptee ? 'ACCEPTED' : 'REFUSED', motif]
      );

      if (!carteAcceptee) {
        await db.query(
          `INSERT INTO logs_audit (client_id, action, details)
           VALUES ($1, 'PAYMENT_REFUSED', $2)`,
          [clientId, JSON.stringify({ motif: 'Carte invalide', from: actuel, to: cible })]
        );

        return res.status(402).json({
          error: `Paiement refusé. Vous restez en ${actuel}.`,
          plan: actuel,
          hint: 'Pour le MVP, utilisez la carte de test : 4242 4242 4242 4242',
        });
      }

      // Changement de forfait et d'abonnement en une seule transaction
      const conn = await db.pool.connect();
      try {
        await conn.query('BEGIN');
        await conn.query('UPDATE clients SET plan = $1 WHERE id = $2', [cible, clientId]);
        await conn.query(
          `UPDATE abonnements SET actif = FALSE, date_fin = NOW()
           WHERE client_id = $1 AND actif = TRUE`,
          [clientId]
        );
        await conn.query('INSERT INTO abonnements (client_id, plan) VALUES ($1, $2)', [clientId, cible]);
        await conn.query(
          `INSERT INTO logs_audit (client_id, action, details)
           VALUES ($1, 'UPGRADE_SUCCESS', $2)`,
          [clientId, JSON.stringify({ from: actuel, to: cible })]
        );
        await conn.query('COMMIT');
      } catch (err) {
        await conn.query('ROLLBACK');
        throw err;
      } finally {
        conn.release();
      }

      const limites = PLANS[cible];
      res.json({
        message: `Passage en ${cible} réussi !`,
        plan: cible,
        limites: {
          maxUtilisateurs: limites.maxUtilisateurs,
          maxCours: limites.maxCours === -1 ? 'Illimité' : limites.maxCours,
          stockageGo: limites.stockageGo,
          pluginsCustom: limites.pluginsCustom,
          frequenceBackup: limites.frequenceBackup,
        },
      });
    } catch (err) {
      console.error('Erreur upgrade:', err);
      res.status(500).json({ error: 'Erreur serveur lors de l\'upgrade' });
    }
  }
);

// ============================================================
// GET /api/subscription/instance — Mon instance Moodle
// ============================================================
router.get('/instance', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT slug, url, statut, version_moodle, created_at
       FROM instances_moodle WHERE client_id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aucune instance trouvée' });
    }

    res.json({ instance: result.rows[0] });
  } catch (err) {
    console.error('Erreur récupération instance:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
