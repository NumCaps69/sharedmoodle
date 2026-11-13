const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, generateToken } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');
const { findUniqueSlug, deployClientStack } = require('../services/provisioning');

const router = express.Router();

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, nom, organisation, slug, plan, statut
       FROM clients WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }

    return res.json({ client: result.rows[0] });
  } catch (err) {
    console.error('Erreur récupération session:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// POST /api/auth/register — Inscription d'un nouveau client
// ============================================================
router.post(
  '/register',
  registerLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('password').isLength({ min: 8 }).withMessage('Mot de passe : 8 caractères minimum'),
    body('nom').trim().isLength({ min: 2 }).withMessage('Nom requis'),
    body('organisation').trim().isLength({ min: 2 }).withMessage('Nom d\'organisation requis'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, nom, organisation } = req.body;

    try {
      // Vérifier si l'email existe déjà
      const existing = await db.query('SELECT id FROM clients WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Cet email est déjà utilisé' });
      }

      // Générer le slug unique
      const slug = await findUniqueSlug(organisation);

      // Hasher le mot de passe
      const passwordHash = await bcrypt.hash(password, 12);

      // Créer le client
      const result = await db.query(
        `INSERT INTO clients (email, password_hash, nom, organisation, slug, plan, statut)
         VALUES ($1, $2, $3, $4, $5, 'FREE', 'PENDING')
         RETURNING id, email, nom, organisation, slug, plan, statut, created_at`,
        [email, passwordHash, nom, organisation, slug]
      );

      const client = result.rows[0];

      // Créer l'abonnement FREE
      await db.query(
        `INSERT INTO abonnements (client_id, plan) VALUES ($1, 'FREE')`,
        [client.id]
      );

      // Lancer le provisioning de l'instance Moodle
      const { url, adminPassword } = await deployClientStack(client.id, slug, 'FREE');

      // Log d'audit
      await db.query(
        `INSERT INTO logs_audit (client_id, action, details, ip_address)
         VALUES ($1, 'REGISTER', $2, $3)`,
        [client.id, JSON.stringify({ organisation, slug }), req.ip]
      );

      // Générer les tokens
      const token = generateToken(client);

      // Envoyer le token en cookie httpOnly
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24h
      });

      res.status(201).json({
        message: 'Inscription réussie ! Votre instance Moodle est en cours de création.',
        client: {
          id: client.id,
          email: client.email,
          nom: client.nom,
          organisation: client.organisation,
          slug: client.slug,
          plan: client.plan,
        },
        instance: {
          url,
          adminPassword,
          status: 'PROVISIONING',
        },
      });
    } catch (err) {
      console.error('Erreur inscription:', err);
      res.status(500).json({ error: 'Erreur serveur lors de l\'inscription' });
    }
  }
);

// ============================================================
// POST /api/auth/login — Connexion
// ============================================================
router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const result = await db.query(
        'SELECT id, email, password_hash, nom, organisation, slug, plan, statut FROM clients WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
      }

      const client = result.rows[0];

      // Vérifier le mot de passe
      const valid = await bcrypt.compare(password, client.password_hash);
      if (!valid) {
        // Log de tentative échouée
        await db.query(
          `INSERT INTO logs_audit (client_id, action, details, ip_address)
           VALUES ($1, 'LOGIN_FAILED', '{}', $2)`,
          [client.id, req.ip]
        );
        return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
      }

      if (client.statut === 'SUSPENDED') {
        return res.status(403).json({ error: 'Votre compte est suspendu. Contactez le support.' });
      }

      // Générer les tokens
      const token = generateToken(client);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
      });

      // Log de connexion
      await db.query(
        `INSERT INTO logs_audit (client_id, action, ip_address)
         VALUES ($1, 'LOGIN_SUCCESS', $2)`,
        [client.id, req.ip]
      );

      res.json({
        client: {
          id: client.id,
          email: client.email,
          nom: client.nom,
          organisation: client.organisation,
          slug: client.slug,
          plan: client.plan,
        },
      });
    } catch (err) {
      console.error('Erreur login:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ============================================================
// POST /api/auth/logout — Déconnexion
// ============================================================
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Déconnexion réussie' });
});

module.exports = router;
