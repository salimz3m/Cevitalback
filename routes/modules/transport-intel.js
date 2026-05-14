// routes/modules/transport-intel.js — Sprint 5
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../../middleware/auth");
const {
  getSuggestions,
  regroupementOptimal,
  scorerPrestataires,
  estimerCoutDelai,
  detecterAlertes,
  analyserPerformance,
} = require("../../services/modules/transportOptimizer");

const CAN_TRANSPORT = ["admin", "transport"];
const { requireModule } = require("../../middleware/moduleGate");

// Bon ordre
router.use(authenticate);
router.use(authorize(...CAN_TRANSPORT));
router.use(requireModule("TRANSPORT_INTEL"));
// ─────────────────────────────────────────────────────────────
// GET /api/modules/transport-intel/suggestions
// Dashboard complet : alertes + regroupement + prestataires + KPI
// ─────────────────────────────────────────────────────────────
router.get(
  "/suggestions",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const data = await getSuggestions(req.user.companyId);
      res.json(data);
    } catch (err) {
      console.error("[transport-intel] getSuggestions:", err);
      res.status(500).json({ message: "Erreur module transport intelligent" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/modules/transport-intel/regroupement
// Suggestions de regroupement seules (plus léger)
// ─────────────────────────────────────────────────────────────
router.get(
  "/regroupement",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const data = await regroupementOptimal(req.user.companyId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Erreur module regroupement" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/modules/transport-intel/prestataires
// Scoring prestataires seul
// ─────────────────────────────────────────────────────────────
router.get(
  "/prestataires",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const data = await scorerPrestataires(req.user.companyId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Erreur module prestataires" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/modules/transport-intel/alertes
// Alertes actives seules (polling possible toutes les Xmin)
// ─────────────────────────────────────────────────────────────
router.get(
  "/alertes",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const data = await detecterAlertes(req.user.companyId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Erreur module alertes" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/modules/transport-intel/performance
// KPI de performance transport
// ─────────────────────────────────────────────────────────────
router.get(
  "/performance",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const data = await analyserPerformance(req.user.companyId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Erreur module performance" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/modules/transport-intel/estimer
// Estimation coût/délai à la volée (utilisé dans le formulaire
// de création d'ordre pour afficher une estimation live)
// Body: { clrRegion, qtePalettes, prestataire? }
// ─────────────────────────────────────────────────────────────
router.post(
  "/estimer",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const { clrRegion, qtePalettes, prestataire } = req.body;

      // Si un prestataire est fourni, récupérer ses stats pour affiner l'estimation
      let statsPrestataire = null;
      if (prestataire) {
        const { prestataires } = await scorerPrestataires(req.user.companyId);
        statsPrestataire =
          prestataires.find(
            (p) => p.nom.toLowerCase() === prestataire.toLowerCase(),
          ) || null;
      }

      const estimation = estimerCoutDelai(
        clrRegion,
        parseFloat(qtePalettes) || 1,
        prestataire,
        statsPrestataire,
      );

      res.json({ ...estimation, statsPrestataire });
    } catch (err) {
      res.status(500).json({ message: "Erreur estimation" });
    }
  },
);

module.exports = router;
