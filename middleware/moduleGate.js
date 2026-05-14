// middleware/moduleGate.js — Sprint 8
// Vérifie que le module est activé pour la company avant de laisser passer la requête
// Usage dans les routes : router.use(requireModule('TRANSPORT_INTEL'))

const { CompanyModule } = require('../models');

// Cache en mémoire TTL 5 min pour éviter une requête DB à chaque appel
const cache = new Map(); // key: `${companyId}:${moduleKey}` → { actif, expiry }
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function isModuleActif(companyId, moduleKey) {
  const cacheKey = `${companyId}:${moduleKey}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() < cached.expiry) {
    return cached.actif;
  }

  try {
    const module = await CompanyModule.findOne({
      where: { companyId, moduleKey },
      attributes: ['actif'],
    });

    const actif = module?.actif || false;
    cache.set(cacheKey, { actif, expiry: Date.now() + CACHE_TTL });
    return actif;
  } catch (err) {
    console.error('moduleGate cache error:', err.message);
    return false;
  }
}

// Vider le cache pour une company (appeler après toggle module)
function clearModuleCache(companyId, moduleKey) {
  if (moduleKey) {
    cache.delete(`${companyId}:${moduleKey}`);
  } else {
    // Vider tous les modules de cette company
    for (const key of cache.keys()) {
      if (key.startsWith(`${companyId}:`)) cache.delete(key);
    }
  }
}

// Middleware factory
// Usage : router.use(requireModule('STOCK_INTEL'))
// Usage : router.get('/route', requireModule('KPI_DASHBOARD'), handler)
function requireModule(moduleKey) {
  return async (req, res, next) => {
    if (!req.user?.companyId) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const actif = await isModuleActif(req.user.companyId, moduleKey);

    if (!actif) {
      return res.status(403).json({
        error: 'Module non activé',
        module: moduleKey,
        message: `Le module ${moduleKey} n'est pas activé pour votre organisation. Contactez votre administrateur.`,
      });
    }

    next();
  };
}

module.exports = { requireModule, clearModuleCache };
