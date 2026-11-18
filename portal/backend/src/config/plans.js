// Définition des forfaits et de leurs limites
// Miroir de la table "limites" en BDD (portal/backend/sql/init.sql)

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
  PLATINUM: {
    maxUtilisateurs: 5000,
    maxCours: -1,
    stockageGo: 100,
    pluginsCustom: true,
    frequenceBackup: 'toutes les 6h',
    supportDelai: '1h',
    prix: 99.99,
  },
};

// Ordre croissant : on ne peut passer qu'à un forfait supérieur
const PLAN_ORDER = ['FREE', 'GOLD', 'PLATINUM'];

function nextPlan(plan) {
  const index = PLAN_ORDER.indexOf(plan);
  return index >= 0 && index < PLAN_ORDER.length - 1 ? PLAN_ORDER[index + 1] : null;
}

function isUpgrade(from, to) {
  return PLAN_ORDER.indexOf(to) > PLAN_ORDER.indexOf(from);
}

// Carte de test acceptée pour le MVP
const TEST_CARD = '4242424242424242';

module.exports = { PLANS, PLAN_ORDER, nextPlan, isUpgrade, TEST_CARD };
