// routes/modules/planning-intel.js
//
// Module intelligent Planification — LECTURE SEULE
// Toutes les routes sont en GET, aucune modification de données

const express = require("express");
const router  = express.Router();
const { authenticate, authorize } = require("../../middleware/auth");
const {
  getDashboardCLR,
  getSuggestionDiapason,
  getAlertesRupture,
  simulerFlux,
  getOptimisationChargement,
} = require("../../services/modules/planningAnalyzer");

const CAN_PLANIF = ["admin", "planification"];

// ─────────────────────────────────────────────────────────────
// GET /api/modules/planning-intel/dashboard
// Dashboard couleur par CLR (VERT / ORANGE / ROUGE)
// ─────────────────────────────────────────────────────────────
router.get("/dashboard", authenticate, authorize(...CAN_PLANIF), async (req, res) => {
  try {
    const result = await getDashboardCLR(req.user.companyId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur analyse dashboard", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/modules/planning-intel/suggestion-diapason/:clrId
// Suggestion D1 vs D2 pour un CLR donné
// ─────────────────────────────────────────────────────────────
router.get("/suggestion-diapason/:clrId", authenticate, authorize(...CAN_PLANIF), async (req, res) => {
  try {
    const result = await getSuggestionDiapason(
      parseInt(req.params.clrId),
      req.user.companyId
    );
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(err.message === "CLR introuvable" ? 404 : 500)
       .json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/modules/planning-intel/alertes
// Alertes rupture anticipée
// ─────────────────────────────────────────────────────────────
router.get("/alertes", authenticate, authorize(...CAN_PLANIF), async (req, res) => {
  try {
    const result = await getAlertesRupture(req.user.companyId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur analyse alertes", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/modules/planning-intel/simuler
// Simulation de flux
// Body: { clrId, quantite, diapason }
// ─────────────────────────────────────────────────────────────
router.post("/simuler", authenticate, authorize(...CAN_PLANIF), async (req, res) => {
  try {
    const { clrId, quantite, diapason } = req.body;

    if (!clrId || !quantite || !diapason) {
      return res.status(400).json({ message: "clrId, quantite et diapason sont requis" });
    }
    if (!["D1", "D2"].includes(diapason)) {
      return res.status(400).json({ message: "diapason doit être D1 ou D2" });
    }
    if (quantite <= 0) {
      return res.status(400).json({ message: "quantite doit être positive" });
    }

    const result = await simulerFlux(
      parseInt(clrId),
      parseFloat(quantite),
      diapason,
      req.user.companyId
    );
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/modules/planning-intel/optimisation/:sessionId
// Optimisation chargement pour une session de planification
// ─────────────────────────────────────────────────────────────
router.get("/optimisation/:sessionId", authenticate, authorize(...CAN_PLANIF), async (req, res) => {
  try {
    const result = await getOptimisationChargement(
      parseInt(req.params.sessionId),
      req.user.companyId
    );
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(err.message === "Session introuvable" ? 404 : 500)
       .json({ message: err.message });
  }
});

module.exports = router;
