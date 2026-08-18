import rateLimit from 'express-rate-limit'

// Limite stricte pour login (5 tentatives / 15 min)
// Protection contre:
// - Attaques par force brute
// - Credential stuffing
// - Dictionnaire
// ✅ Rate limit login par utilisateur
// middleware/rateLimiter.js
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({
      success: false,
      error: 'Trop de tentatives de connexion',
      message: `Vous avez dépassé la limite de ${options.max} tentatives`,
      retryAfter: Math.ceil(options.windowMs / 60000) + ' minutes',
      code: 'RATE_LIMIT_EXCEEDED',
      timestamp: new Date().toISOString(),
    })
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// Limite modérée pour register (10 inscriptions / heure)
// Protection contre:
// - Création massive de comptes
// - Spam
// - Bot attacks
// ✅ Rate limit register par email
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Trop de tentatives d'inscription" },
})
