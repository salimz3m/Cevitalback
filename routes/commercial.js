const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  getClients,
  getHistoriqueClient,
  confirmerLivraison,
  getKPICommercial,
  syncClientsDepuisOrders,
} = require("../services/commercialService");

const CAN_COMMERCIAL = ["admin", "planification", "commercial"];

// ─────────────────────────────────────────────────────────────
// GET /api/commercial/clients
// Liste tous les clients, filtrable par ?clrId=
// ─────────────────────────────────────────────────────────────
router.get(
  "/clients",
  authenticate,
  authorize(...CAN_COMMERCIAL),
  async (req, res) => {
    try {
      const clients = await getClients(req.user.companyId, {
        clrId: req.query.clrId,
      });
      res.json(clients);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/commercial/clients/:codeClient
// Historique complet d'un client
// ─────────────────────────────────────────────────────────────
router.get(
  "/clients/:codeClient",
  authenticate,
  authorize(...CAN_COMMERCIAL),
  async (req, res) => {
    try {
      const result = await getHistoriqueClient(
        req.params.codeClient,
        req.user.companyId,
      );
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/commercial/livraison
// Confirme livraison → SORTIE_VENTE
// Body: { orderId, clrId, notes }
// ─────────────────────────────────────────────────────────────
router.post(
  "/livraison",
  authenticate,
  authorize(...CAN_COMMERCIAL),
  async (req, res) => {
    try {
      const { orderId, clrId, notes } = req.body;
      if (!orderId || !clrId)
        return res
          .status(400)
          .json({ message: "orderId et clrId sont requis" });

      const result = await confirmerLivraison({
        orderId: parseInt(orderId),
        clrId: parseInt(clrId),
        userId: req.user.id,
        companyId: req.user.companyId,
        notes,
      });
      res.json(result);
    } catch (err) {
      console.error(err);
      res
        .status(
          err.message.includes("introuvable") || err.message.includes("déjà")
            ? 400
            : 500,
        )
        .json({ message: err.message });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/commercial/kpi
// KPI commercial global + par CLR
// ─────────────────────────────────────────────────────────────
router.get(
  "/kpi",
  authenticate,
  authorize(...CAN_COMMERCIAL),
  async (req, res) => {
    try {
      const result = await getKPICommercial(req.user.companyId);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/commercial/sync-clients
// Synchronise clients depuis les commandes existantes (admin)
// ─────────────────────────────────────────────────────────────
router.post(
  "/sync-clients",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    try {
      const result = await syncClientsDepuisOrders(req.user.companyId);
      res.json({ message: `${result.crees} client(s) créé(s)`, ...result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message });
    }
  },
);

module.exports = router;
