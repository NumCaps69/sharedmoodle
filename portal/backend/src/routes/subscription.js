const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { PLANS, TEST_CARD } = require('../config/plans');
const { updateInstanceLimits } = require('../services/provisioning');

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
// ============================================================
router.get('/consumption', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT co.nb_utilisateurs, co.nb_cours, co.stockage_utilise_mo, co.derniere_maj,
              l.max_utilisateurs, l.max_cours, l.stockage_go
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
    res.json({
      consommation: {
        utilisateurs: {
          actuel: data.nb_utilisateurs,
          max: data.max_utilisateurs,
          pourcentage: Math.round((data.nb_utilisateurs / data.max_utilisateurs) * 100),
        },
        cours: {
          actuel: data.nb_cours,
          max: data.max_cours === -1 ? 'Illimité' : data.max_cours,
          pourcentage: data.max_cours === -1 ? 0 : Math.round((data.nb_cours / data.max_cours) * 100),
        },
        stockage: {
          utiliseMo: parseFloat(data.stockage_utilise_mo),
          maxGo: data.stockage_go,
          pourcentage: Math.round((parseFloat(data.stockage_utilise_mo) / (data.stockage_go * 1024)) * 100),
        },
        derniereMaj: data.derniere_maj,
      },
    });
  } catch (err) {
    console.error('Erreur récupération consommation:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// POST /api/subscription/upgrade — Passer en GOLD
// ============================================================
router.post(
  '/upgrade',
  [
    body('numeroCarte')
      .trim()
      .notEmpty()
      .withMessage('Numéro de carte requis'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { numeroCarte } = req.body;
    const clientId = req.user.id;

    try {
      // Vérifier que le client est en FREE
      const clientResult = await db.query(
        'SELECT plan FROM clients WHERE id = $1',
        [clientId]
      );

      if (clientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Client non trouvé' });
      }

      if (clientResult.rows[0].plan === 'GOLD') {
        return res.status(400).json({ error: 'Vous êtes déjà en forfait GOLD' });
      }

      // Nettoyer le numéro de carte (retirer les espaces)
      const carteNettoyee = numeroCarte.replace(/\s+/g, '');

      // Vérifier la carte de test
      const carteAcceptee = carteNettoyee === TEST_CARD;

      // Masquer le numéro pour le stockage
      const carteMasquee = `${carteNettoyee.slice(0, 4)} **** **** ${carteNettoyee.slice(-4)}`;

      // Enregistrer le paiement
      await db.query(
        `INSERT INTO paiements (client_id, montant, numero_carte, statut, motif)
         VALUES ($1, $2, $3, $4, 'Upgrade FREE -> GOLD')`,
        [clientId, PLANS.GOLD.prix, carteMasquee, carteAcceptee ? 'ACCEPTED' : 'REFUSED']
      );

      if (!carteAcceptee) {
        // Log de paiement refusé
        await db.query(
          `INSERT INTO logs_audit (client_id, action, details)
           VALUES ($1, 'PAYMENT_REFUSED', '{"motif": "Carte invalide"}')`,
          [clientId]
        );

        return res.status(400).json({
          error: 'Paiement refusé. La carte n\'est pas acceptée.',
          hint: 'Pour le MVP, utilisez la carte de test : 4242 4242 4242 4242',
        });
      }

      // Mettre à jour le forfait du client
      await db.query(
        'UPDATE clients SET plan = $1 WHERE id = $2',
        ['GOLD', clientId]
      );

      // Désactiver l'ancien abonnement et créer le nouveau
      await db.query(
        `UPDATE abonnements SET actif = FALSE, date_fin = NOW()
         WHERE client_id = $1 AND actif = TRUE`,
        [clientId]
      );
      await db.query(
        `INSERT INTO abonnements (client_id, plan) VALUES ($1, 'GOLD')`,
        [clientId]
      );

      // Mettre à jour les limites de l'instance Moodle
      await updateInstanceLimits(clientId, 'GOLD');

      // Log de succès
      await db.query(
        `INSERT INTO logs_audit (client_id, action, details)
         VALUES ($1, 'UPGRADE_SUCCESS', '{"from": "FREE", "to": "GOLD"}')`,
        [clientId]
      );

      // Récupérer les nouvelles limites
      const limites = PLANS.GOLD;

      res.json({
        message: 'Upgrade en GOLD réussi !',
        plan: 'GOLD',
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
