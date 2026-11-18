require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { generalLimiter } = require('./middleware/rateLimiter');
const { migrate } = require('./config/migrate');
const { PLANS, PLAN_ORDER } = require('./config/plans');
const { refreshAll } = require('./services/usage');
const { compterRequetes, startMetricsServer } = require('./services/metrics');

// Routes
const authRoutes = require('./routes/auth');
const subscriptionRoutes = require('./routes/subscription');
const catalogueRoutes = require('./routes/catalogue');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// L'API est derrière 2 proxys (Traefik puis nginx du portail) :
// sans ce réglage, tous les clients auraient l'adresse du proxy et
// partageraient la même limite de requêtes.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 2));

// ============================================================
// Middlewares globaux
// ============================================================
app.use(compterRequetes);
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
app.use((req, res, next) => (req.path === '/api/health' ? next() : generalLimiter(req, res, next)));

// ============================================================
// Routes API
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/catalogue', catalogueRoutes);
app.use('/api/admin', adminRoutes);

// Liste publique des forfaits (affichée sur l'accueil et la page abonnement)
app.get('/api/plans', (req, res) => {
  res.json({ plans: PLAN_ORDER.map((nom) => ({ nom, ...PLANS[nom] })) });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'sharedmoodle-api',
    version: require('../package.json').version,
    instance: require('os').hostname(), // identifie la copie (réplica) qui répond
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
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Fichier trop gros' });
  }
  console.error('Erreur non gérée:', err);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

// ============================================================
// Démarrage
// ============================================================
if (require.main === module) {
  migrate()
    .then(() => {
      // Mesure et limites appliquées pour tous les clients, toutes les 5 min
      const periode = Number(process.env.USAGE_REFRESH_SECONDS || 300) * 1000;
      setInterval(() => refreshAll().catch((e) => console.error('Mesure périodique :', e.message)), periode).unref();
      // Port interne pour Prometheus (non publié) ; 0 = désactivé
      const metricsPort = Number(process.env.METRICS_PORT ?? 9464);
      if (metricsPort) startMetricsServer(metricsPort);
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
