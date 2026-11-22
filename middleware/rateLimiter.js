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

// Soit 3 tentatives par heure minutes et par IP.
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 3,
  message: {
    error: 'Trop de demandes de réinitialisation. Réessayez plus tard.',
  },
})

// Soit 5 tentatives par 15 minutes et par IP.
// Car l'utilisateur peut se tromper plusieurs fois de mot de passe ou rencontrer des problèmes de formulaire
export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    error: 'Trop de demandes de réinitialisation. Réessayez plus tard.',
  },
})
