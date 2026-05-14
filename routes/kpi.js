const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  getSynthese,
  kpiStock,
  kpiFlux,
  kpiTransport,
  kpiCommandes,
} = require("../services/kpiService");

const CAN_KPI = ["admin", "planification"];

// ─────────────────────────────────────────────────────────────
// GET /api/kpi/synthese — tout en un (dashboard principal)
// ─────────────────────────────────────────────────────────────
router.get(
  "/synthese",
  authenticate,
  authorize(...CAN_KPI),
  async (req, res) => {
    try {
      const data = await getSynthese(req.user.companyId);
      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/kpi/stock
// ─────────────────────────────────────────────────────────────
router.get("/stock", authenticate, authorize(...CAN_KPI), async (req, res) => {
  try {
    res.json(await kpiStock(req.user.companyId));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/kpi/flux
// ─────────────────────────────────────────────────────────────
router.get("/flux", authenticate, authorize(...CAN_KPI), async (req, res) => {
  try {
    res.json(await kpiFlux(req.user.companyId));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/kpi/transport
// ─────────────────────────────────────────────────────────────
router.get(
  "/transport",
  authenticate,
  authorize(...CAN_KPI),
  async (req, res) => {
    try {
      res.json(await kpiTransport(req.user.companyId));
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/kpi/commandes
// ─────────────────────────────────────────────────────────────
router.get(
  "/commandes",
  authenticate,
  authorize(...CAN_KPI),
  async (req, res) => {
    try {
      res.json(await kpiCommandes(req.user.companyId));
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/kpi/ia-insights — Claude analyse les données réelles
// Body: { contexte? } — optionnel pour affiner la question
// ─────────────────────────────────────────────────────────────
router.post(
  "/ia-insights",
  authenticate,
  authorize(...CAN_KPI),
  async (req, res) => {
    try {
      const synthese = await getSynthese(req.user.companyId);
      const { contexte } = req.body;

      const prompt = `Tu es un expert en logistique et supply chain pour une entreprise agroalimentaire algérienne (Cevital).
Voici les KPI réels de la plateforme logistique en temps réel :

STOCK :
- Valeur totale : ${synthese.stock?.valeurTotaleDZD?.toLocaleString()} DZD
- Produits actifs : ${synthese.stock?.nbProduitsActifs}
- Ruptures actives : ${synthese.stock?.nbRuptures}
- Alertes stock : ${synthese.stock?.nbAlertes}

COMMANDES :
- Total : ${synthese.commandes?.nbTotal} commandes
- Taux de service global : ${synthese.commandes?.tauxServiceGlobal}%
- CA estimé livré : ${synthese.commandes?.caEstimeDZD?.toLocaleString()} DZD
- En attente : ${synthese.commandes?.nbPending}

TRANSPORT :
- Ordres totaux : ${synthese.transport?.nbOrdresTotal}
- Taux remplissage moyen camions : ${synthese.transport?.tauxRemplissageMoyen}%
- Ordres en cours : ${synthese.transport?.nbEnCours}

RÉSEAU CLR :
- CLR en bonne situation : ${synthese.clrs?.resume?.totalVert}
- CLR en alerte : ${synthese.clrs?.resume?.totalOrange}
- CLR en rupture : ${synthese.clrs?.resume?.totalRouge}

SCORE GLOBAL : ${synthese.scoreGlobal}/100
${contexte ? `\nCONTEXTE SUPPLÉMENTAIRE : ${contexte}` : ""}

Fournis une analyse concise en 4 points :
1. DIAGNOSTIC — état global en 2 phrases
2. POINTS CRITIQUES — top 3 problèmes à traiter maintenant
3. OPPORTUNITÉS — 2 optimisations concrètes possibles
4. RECOMMANDATIONS — actions prioritaires cette semaine

Réponds en français, sois direct et opérationnel. Format JSON :
{
  "diagnostic": "...",
  "pointsCritiques": ["...", "...", "..."],
  "opportunites": ["...", "..."],
  "recommandations": ["...", "...", "..."],
  "scoreCommentaire": "..."
}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || "";

      let insights;
      try {
        const clean = text.replace(/```json|```/g, "").trim();
        insights = JSON.parse(clean);
      } catch {
        insights = {
          diagnostic: text,
          pointsCritiques: [],
          opportunites: [],
          recommandations: [],
        };
      }

      res.json({
        insights,
        scoreGlobal: synthese.scoreGlobal,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message });
    }
  },
);

module.exports = router;
