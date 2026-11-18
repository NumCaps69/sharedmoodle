// ============================================================
// Catalogue de cours partagés (intelligence collective)
//
//   GET    /api/catalogue[?q=&discipline=]   liste publique (sans fichiers)
//   GET    /api/catalogue/jsonld             données ouvertes (schema.org)
//   POST   /api/catalogue?titre=&licence=... dépôt d'un .mbz (connecté)
//   GET    /api/catalogue/:id/fichier        téléchargement (connecté)
//   DELETE /api/catalogue/:id                retrait (auteur ou admin)
// ============================================================

const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const {
  LICENCES, MAX_OCTETS, validerMeta, verifierArchive, nomSur, empreinte, versJsonLd,
} = require('../services/catalogue');

const router = express.Router();
const MAX_PAR_CLIENT = Number(process.env.MAX_SHARED_COURSES || 20);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLONNES = `c.id, c.titre, c.description, c.discipline, c.niveau, c.licence,
  c.nom_fichier, c.taille_octets, c.telechargements, c.created_at,
  cl.organisation, cl.slug AS etablissement`;

async function lister({ q, discipline }) {
  const filtres = [];
  const valeurs = [];
  if (q) {
    valeurs.push(`%${String(q).slice(0, 100)}%`);
    filtres.push(`(c.titre ILIKE $${valeurs.length} OR c.description ILIKE $${valeurs.length})`);
  }
  if (discipline) {
    valeurs.push(String(discipline).slice(0, 60));
    filtres.push(`c.discipline = $${valeurs.length}`);
  }
  const { rows } = await db.query(
    `SELECT ${COLONNES} FROM cours_partages c JOIN clients cl ON cl.id = c.client_id
     ${filtres.length ? `WHERE ${filtres.join(' AND ')}` : ''}
     ORDER BY c.created_at DESC LIMIT 200`,
    valeurs
  );
  return rows;
}

router.get('/', async (req, res) => {
  try {
    const cours = await lister(req.query);
    const { rows } = await db.query("SELECT DISTINCT discipline FROM cours_partages WHERE discipline <> '' ORDER BY 1");
    res.json({
      cours,
      disciplines: rows.map((r) => r.discipline),
      licences: Object.keys(LICENCES),
      tailleMaxMo: MAX_OCTETS / 1024 / 1024,
    });
  } catch (err) {
    console.error('Catalogue :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/jsonld', async (req, res) => {
  try {
    const base = `${req.protocol}://${req.get('host')}`;
    res.type('application/ld+json').send(JSON.stringify(versJsonLd(await lister({}), base), null, 2));
  } catch (err) {
    console.error('Catalogue JSON-LD :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Le fichier arrive brut (corps de la requête), les métadonnées dans l'adresse
router.post(
  '/',
  authMiddleware,
  express.raw({ type: () => true, limit: MAX_OCTETS }),
  async (req, res) => {
    try {
      const { erreur, meta } = validerMeta(req.query);
      if (erreur) return res.status(400).json({ error: erreur });
      const nom = nomSur(req.query.fichier);
      const probleme = verifierArchive(req.body, nom);
      if (probleme) return res.status(400).json({ error: probleme });

      const { rows: [client] } = await db.query(
        `SELECT statut, (SELECT COUNT(*) FROM cours_partages WHERE client_id = $1) AS partages
         FROM clients WHERE id = $1`,
        [req.user.id]
      );
      if (!client || client.statut !== 'ACTIVE') return res.status(403).json({ error: 'Compte inactif' });
      // Plafond par établissement : le catalogue ne peut pas remplir la base du portail
      if (Number(client.partages) >= MAX_PAR_CLIENT) {
        return res.status(403).json({ error: `Limite de ${MAX_PAR_CLIENT} cours partagés atteinte : retirez-en un d'abord` });
      }

      const { rows: [cours] } = await db.query(
        `INSERT INTO cours_partages (client_id, titre, description, discipline, niveau, licence, nom_fichier, taille_octets, sha256, fichier)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, titre, created_at`,
        [req.user.id, meta.titre, meta.description, meta.discipline, meta.niveau, meta.licence,
          nom, req.body.length, empreinte(req.body), req.body]
      );
      await db.query(
        `INSERT INTO logs_audit (client_id, action, details, ip_address) VALUES ($1, 'COURS_PARTAGE', $2, $3)`,
        [req.user.id, JSON.stringify({ cours: cours.id, titre: meta.titre }), req.ip]
      );
      res.status(201).json({ message: 'Cours ajouté au catalogue', cours });
    } catch (err) {
      console.error('Dépôt de cours :', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

router.get('/:id/fichier', authMiddleware, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Cours introuvable' });
  try {
    const { rows: [cours] } = await db.query(
      `UPDATE cours_partages SET telechargements = telechargements + 1 WHERE id = $1
       RETURNING nom_fichier, sha256, fichier`,
      [req.params.id]
    );
    if (!cours) return res.status(404).json({ error: 'Cours introuvable' });
    await db.query(
      `INSERT INTO logs_audit (client_id, action, details, ip_address) VALUES ($1, 'COURS_TELECHARGE', $2, $3)`,
      [req.user.id, JSON.stringify({ cours: req.params.id }), req.ip]
    );
    res.set({
      'Content-Type': 'application/vnd.moodle.backup',
      'Content-Disposition': `attachment; filename="${cours.nom_fichier}"`,
      'X-Content-SHA256': cours.sha256,
    });
    res.send(cours.fichier);
  } catch (err) {
    console.error('Téléchargement de cours :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Cours introuvable' });
  try {
    const { rowCount } = await db.query(
      `DELETE FROM cours_partages c
       WHERE c.id = $1
         AND (c.client_id = $2 OR EXISTS (SELECT 1 FROM clients a WHERE a.id = $2 AND a.est_admin))`,
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Cours introuvable ou pas le vôtre' });
    res.json({ message: 'Cours retiré du catalogue' });
  } catch (err) {
    console.error('Retrait de cours :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
