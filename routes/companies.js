const express = require("express");
const router = express.Router();
const { Company, Depot } = require("../models");
const { authenticate, authorize } = require("../middleware/auth");

// ─── Companies ──────────────────────────────────────────────────

// POST /api/companies — créer une entreprise (setup initial)
router.post("/", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Nom requis" });
    const company = await Company.create({ name });
    res.status(201).json(company);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// GET /api/companies
router.get("/", authenticate, authorize("admin"), async (req, res) => {
  try {
    const companies = await Company.findAll();
    res.json(companies);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// ─── Depots ─────────────────────────────────────────────────────

// GET /api/companies/depots
router.get("/depots", authenticate, async (req, res) => {
  try {
    const depots = await Depot.findAll({
      where: { companyId: req.user.companyId },
    });
    res.json(depots);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// POST /api/companies/depots
router.post("/depots", authenticate, authorize("admin"), async (req, res) => {
  try {
    const { name, type, location } = req.body;
    if (!name || !type)
      return res.status(400).json({ message: "Nom et type requis" });
    const depot = await Depot.create({
      name,
      type,
      location,
      companyId: req.user.companyId,
    });
    res.status(201).json(depot);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

module.exports = router;
