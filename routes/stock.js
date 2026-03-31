const express = require("express");
const router = express.Router();
const { Stock, OrderItem, Order, Depot } = require("../models");
const { Op } = require("sequelize");
const { authenticate } = require("../middleware/auth");

// GET /api/stock — liste des stocks
router.get("/", authenticate, async (req, res) => {
  try {
    const stocks = await Stock.findAll({
      where: { companyId: req.user.companyId },
      include: [Depot],
    });
    res.json(stocks);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

/**
 * GET /api/stock/compare
 * Comparateur Stock disponible VS Commandé (CDC §5.2)
 * Retourne pour chaque produit : stock dispo, quantité commandée, écart, alerte
 */
router.get("/compare", authenticate, async (req, res) => {
  try {
    // Stock disponible
    const stocks = await Stock.findAll({
      where: { companyId: req.user.companyId },
    });

    // Quantités commandées (commandes non livrées)
    const orderedItems = await OrderItem.findAll({
      include: [
        {
          model: Order,
          where: {
            companyId: req.user.companyId,
            status: { [Op.in]: ["pending", "planned"] },
          },
          attributes: [],
        },
      ],
    });

    // Agrégation par produit
    const orderedByProduct = {};
    orderedItems.forEach((item) => {
      const key = item.productName.toLowerCase().trim();
      orderedByProduct[key] = (orderedByProduct[key] || 0) + item.quantity;
    });

    // Construction du rapport
    const comparison = stocks.map((stock) => {
      const key = stock.productName.toLowerCase().trim();
      const ordered = orderedByProduct[key] || 0;
      const gap = stock.availableQty - ordered;
      return {
        productName: stock.productName,
        depot: stock.Depot?.name || "Non défini",
        availableQty: stock.availableQty,
        orderedQty: ordered,
        gap,
        alert:
          gap < 0
            ? "RUPTURE"
            : gap < stock.availableQty * 0.1
              ? "FAIBLE"
              : "OK",
      };
    });

    res.json(comparison);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// POST /api/stock — ajouter/mettre à jour un stock
router.post("/", authenticate, async (req, res) => {
  try {
    const { productName, availableQty, unit, depotId } = req.body;
    const [stock, created] = await Stock.findOrCreate({
      where: {
        productName,
        companyId: req.user.companyId,
        depotId: depotId || null,
      },
      defaults: { availableQty, unit, lastUpdated: new Date() },
    });
    if (!created)
      await stock.update({ availableQty, unit, lastUpdated: new Date() });
    res.status(created ? 201 : 200).json(stock);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

module.exports = router;
