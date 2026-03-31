const express = require("express");
const router = express.Router();
const { Driver, Delivery, Order } = require("../models");
const { authenticate, authorize } = require("../middleware/auth");

// GET /api/drivers
router.get("/", authenticate, async (req, res) => {
  try {
    const drivers = await Driver.findAll({
      where: { companyId: req.user.companyId },
    });
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// POST /api/drivers
router.post(
  "/",
  authenticate,
  authorize("admin", "transport"),
  async (req, res) => {
    try {
      const { name, email, phone, licenseNumber } = req.body;
      if (!name) return res.status(400).json({ message: "Nom requis" });
      const driver = await Driver.create({
        name,
        email,
        phone,
        licenseNumber,
        companyId: req.user.companyId,
      });
      res.status(201).json(driver);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur", error: err.message });
    }
  },
);

// PUT /api/drivers/:id
router.put(
  "/:id",
  authenticate,
  authorize("admin", "transport"),
  async (req, res) => {
    try {
      const driver = await Driver.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
      });
      if (!driver)
        return res.status(404).json({ message: "Chauffeur introuvable" });
      await driver.update(req.body);
      res.json(driver);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur", error: err.message });
    }
  },
);

// DELETE /api/drivers/:id
router.delete("/:id", authenticate, authorize("admin"), async (req, res) => {
  try {
    const driver = await Driver.findOne({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!driver)
      return res.status(404).json({ message: "Chauffeur introuvable" });
    await driver.destroy();
    res.json({ message: "Chauffeur supprimé" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

module.exports = router;
