// ============================================================
// Catalogue de cours partagés entre établissements (intelligence collective)
//
// Un enseignant sauvegarde son cours dans Moodle (fichier .mbz), le dépose
// dans le catalogue avec une licence libre ; les autres établissements le
// téléchargent et le restaurent dans leur propre Moodle. Les données des
// établissements restent séparées : seul le fichier choisi est partagé.
//
// Le catalogue est aussi publié en données ouvertes (JSON-LD schema.org),
// sans les fichiers ni les adresses des comptes.
// ============================================================

const crypto = require('crypto');

const LICENCES = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC BY-NC-SA 4.0': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
};

const MAX_OCTETS = Number(process.env.MAX_COURSE_MB || 20) * 1024 * 1024;

function texte(valeur, max) {
  return typeof valeur === 'string' ? valeur.trim().slice(0, max) : '';
}

// Métadonnées envoyées avec le fichier ; renvoie { erreur } ou { meta }
function validerMeta(source) {
  const meta = {
    titre: texte(source.titre, 150),
    description: texte(source.description, 2000),
    discipline: texte(source.discipline, 60),
    niveau: texte(source.niveau, 60),
    licence: texte(source.licence, 30),
  };
  if (meta.titre.length < 3) return { erreur: 'Titre requis (3 caractères minimum)' };
  if (!LICENCES[meta.licence]) return { erreur: `Licence à choisir parmi : ${Object.keys(LICENCES).join(', ')}` };
  return { meta };
}

// Une sauvegarde Moodle (.mbz) est une archive tar.gz (ou zip pour les anciennes versions)
function verifierArchive(buffer, nomFichier) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return 'Fichier vide';
  if (buffer.length > MAX_OCTETS) return `Fichier trop gros (maximum ${MAX_OCTETS / 1024 / 1024} Mo)`;
  if (!/\.mbz$/i.test(nomFichier || '')) return 'Le fichier doit être une sauvegarde Moodle (.mbz)';
  const gzip = buffer[0] === 0x1f && buffer[1] === 0x8b;
  const zip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!gzip && !zip) return "Ce fichier n'est pas une sauvegarde Moodle valide";
  return null;
}

// Nom de fichier sûr pour l'en-tête Content-Disposition et la base
function nomSur(nomFichier) {
  const base = String(nomFichier || 'cours.mbz').split(/[\\/]/).pop();
  const propre = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return (propre || 'cours.mbz').slice(0, 200);
}

function empreinte(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Catalogue en données ouvertes liées (schema.org, JSON-LD)
function versJsonLd(cours, baseUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'DataCatalog',
    name: 'SharedMoodle : cours partagés entre établissements',
    url: `${baseUrl}/#catalogue`,
    dataset: cours.map((c) => ({
      '@type': 'Course',
      '@id': `${baseUrl}/api/catalogue/${c.id}`,
      name: c.titre,
      description: c.description,
      about: c.discipline || undefined,
      educationalLevel: c.niveau || undefined,
      inLanguage: 'fr',
      license: LICENCES[c.licence] || c.licence,
      provider: { '@type': 'EducationalOrganization', name: c.organisation },
      dateCreated: new Date(c.created_at).toISOString(),
      encodingFormat: 'application/vnd.moodle.backup',
      contentSize: `${c.taille_octets} B`,
      interactionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/DownloadAction',
        userInteractionCount: Number(c.telechargements),
      },
    })),
  };
}

module.exports = { LICENCES, MAX_OCTETS, validerMeta, verifierArchive, nomSur, empreinte, versJsonLd };
