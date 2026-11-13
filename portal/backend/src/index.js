require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { generalLimiter } = require('./middleware/rateLimiter');

// Routes
const authRoutes = require('./routes/auth');
const subscriptionRoutes = require('./routes/subscription');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Middlewares globaux
// ============================================================
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [`https://${process.env.DOMAIN}`, `https://www.${process.env.DOMAIN}`]
    : 'http://localhost:5500',
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
app.listen(PORT, () => {
  console.log(`SharedMoodle API démarrée sur le port ${PORT}`);
  console.log(`Environnement : ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
