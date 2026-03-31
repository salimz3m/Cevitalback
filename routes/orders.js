const express = require("express");
const router = express.Router();
const { Order, OrderItem, Delivery, Driver, User } = require("../models");
const { authenticate, authorize } = require("../middleware/auth");
const { log } = require("../utils/audit");

// GET /api/orders — liste toutes les commandes de la company
router.get("/", authenticate, async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: { companyId: req.user.companyId },
      include: [OrderItem, { model: Delivery, include: [Driver] }],
      order: [["date", "DESC"]],
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// GET /api/orders/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const order = await Order.findOne({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: [OrderItem, { model: Delivery, include: [Driver] }],
    });
    if (!order)
      return res.status(404).json({ message: "Commande introuvable" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// POST /api/orders — créer une commande
router.post(
  "/",
  authenticate,
  authorize("keep_contact", "admin"),
  async (req, res) => {
    try {
      const { orderNumber, date, items, notes } = req.body;
      if (!orderNumber || !date)
        return res.status(400).json({ message: "orderNumber et date requis" });

      const order = await Order.create({
        orderNumber,
        date,
        notes,
        companyId: req.user.companyId,
        createdBy: req.user.id,
      });

      if (items && items.length > 0) {
        const orderItems = items.map((item) => ({
          ...item,
          orderId: order.id,
        }));
        await OrderItem.bulkCreate(orderItems);
      }

      await log(req.user.id, "CREATE_ORDER", "Order", order.id, {
        orderNumber,
      });

      const full = await Order.findByPk(order.id, { include: [OrderItem] });
      res.status(201).json(full);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur", error: err.message });
    }
  },
);

// PUT /api/orders/:id — mettre à jour une commande
router.put(
  "/:id",
  authenticate,
  authorize("keep_contact", "planification", "admin"),
  async (req, res) => {
    try {
      const order = await Order.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
      });
      if (!order)
        return res.status(404).json({ message: "Commande introuvable" });

      // Vérification du verrou (CDC §5.1)
      if (order.lockedBy && order.lockedBy !== req.user.id) {
        const lockAge = Date.now() - new Date(order.lockedAt).getTime();
        if (lockAge < 5 * 60 * 1000) {
          // Verrou valide 5 minutes
          return res
            .status(423)
            .json({ message: "Commande verrouillée par un autre utilisateur" });
        }
      }

      await order.update({
        ...req.body,
        lockedBy: null,
        lockedAt: null,
      });

      await log(req.user.id, "UPDATE_ORDER", "Order", order.id, req.body);
      res.json(order);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur", error: err.message });
    }
  },
);

// POST /api/orders/:id/lock — acquérir le verrou pour édition
router.post("/:id/lock", authenticate, async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order)
      return res.status(404).json({ message: "Commande introuvable" });

    const lockAge = order.lockedAt
      ? Date.now() - new Date(order.lockedAt).getTime()
      : Infinity;
    if (
      order.lockedBy &&
      order.lockedBy !== req.user.id &&
      lockAge < 5 * 60 * 1000
    ) {
      return res
        .status(423)
        .json({ message: "Déjà verrouillé par un autre utilisateur" });
    }

    await order.update({ lockedBy: req.user.id, lockedAt: new Date() });
    res.json({ message: "Verrou acquis", lockedBy: req.user.id });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// POST /api/orders/:id/unlock — libérer le verrou
router.post("/:id/unlock", authenticate, async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order)
      return res.status(404).json({ message: "Commande introuvable" });
    if (order.lockedBy !== req.user.id && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Vous ne possédez pas ce verrou" });
    }
    await order.update({ lockedBy: null, lockedAt: null });
    res.json({ message: "Verrou libéré" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// DELETE /api/orders/:id
router.delete("/:id", authenticate, authorize("admin"), async (req, res) => {
  try {
    const order = await Order.findOne({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!order)
      return res.status(404).json({ message: "Commande introuvable" });
    await order.destroy();
    await log(req.user.id, "DELETE_ORDER", "Order", req.params.id);
    res.json({ message: "Commande supprimée" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

module.exports = router;
