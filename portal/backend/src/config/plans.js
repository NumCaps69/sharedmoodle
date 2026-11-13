// Définition des forfaits et de leurs limites
// Miroir de la table "limites" en BDD

const PLANS = {
  FREE: {
    maxUtilisateurs: 50,
    maxCours: 5,
    stockageGo: 1,
    pluginsCustom: false,
    frequenceBackup: 'hebdomadaire',
    supportDelai: '48h',
    prix: 0,
  },
  GOLD: {
    maxUtilisateurs: 500,
    maxCours: -1, // illimité
    stockageGo: 20,
    pluginsCustom: true,
    frequenceBackup: 'quotidien',
    supportDelai: '4h',
    prix: 29.99, // EUR/mois (simulé)
  },
};

// Carte de test acceptée pour le MVP
const TEST_CARD = '4242424242424242';

module.exports = { PLANS, TEST_CARD };
