require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { generalLimiter } = require('./middleware/rateLimiter');
const { migrate } = require('./config/migrate');
const { PLANS, PLAN_ORDER } = require('./config/plans');

// Routes
const authRoutes = require('./routes/auth');
const subscriptionRoutes = require('./routes/subscription');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Middlewares globaux
// ============================================================
app.use(helmet());
const developmentOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5500,http://localhost:8080')
  .split(',')
  .map((origin) => origin.trim());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [`https://${process.env.DOMAIN}`, `https://www.${process.env.DOMAIN}`]
    : developmentOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(morgan('combined'));
app.use(generalLimiter);

// ============================================================
// Routes API
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);

// Liste publique des forfaits (affichée sur l'accueil et la page abonnement)
app.get('/api/plans', (req, res) => {
  res.json({ plans: PLAN_ORDER.map((nom) => ({ nom, ...PLANS[nom] })) });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'sharedmoodle-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// Gestion des erreurs
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

// ============================================================
// Démarrage
// ============================================================
if (require.main === module) {
  migrate()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`SharedMoodle API démarrée sur le port ${PORT}`);
        console.log(`Environnement : ${process.env.NODE_ENV || 'development'}`);
      });
    })
    .catch((err) => {
      console.error('Démarrage impossible :', err.message);
      process.exit(1);
    });
}

module.exports = app;
