const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/runtime');

const JWT_SECRET = getJwtSecret();

/**
 * Middleware d'authentification JWT
 * Vérifie le token dans le cookie httpOnly ou le header Authorization
 */
function authMiddleware(req, res, next) {
  // Chercher le token dans le cookie ou le header
  let token = req.cookies?.token;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      email: payload.email,
      plan: payload.plan,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
    }
    return res.status(401).json({ error: 'Token invalide' });
  }
}

/**
 * Middleware admin (à étendre selon vos besoins)
 */
function adminMiddleware(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

/**
 * Génère un JWT pour un client
 */
function generateToken(client) {
  return jwt.sign(
    {
      sub: client.id,
      email: client.email,
      plan: client.plan,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

module.exports = { authMiddleware, adminMiddleware, generateToken };
