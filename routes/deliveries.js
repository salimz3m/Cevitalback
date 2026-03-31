const express = require("express");
const router = express.Router();
const { Delivery, Order, Driver, Depot, OrderItem } = require("../models");
const { authenticate, authorize } = require("../middleware/auth");
const { log } = require("../utils/audit");

// GET /api/deliveries
router.get("/", authenticate, async (req, res) => {
  try {
    const deliveries = await Delivery.findAll({
      include: [
        {
          model: Order,
          where: { companyId: req.user.companyId },
          include: [OrderItem],
        },
        Driver,
        Depot,
      ],
      order: [["deliveryDate", "ASC"]],
    });
    res.json(deliveries);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// GET /api/deliveries/driver/:driverId — livraisons d'un chauffeur
router.get("/driver/:driverId", authenticate, async (req, res) => {
  try {
    const deliveries = await Delivery.findAll({
      where: { driverId: req.params.driverId },
      include: [{ model: Order, include: [OrderItem] }, Depot],
      order: [["deliveryDate", "ASC"]],
    });
    res.json(deliveries);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// POST /api/deliveries — créer/planifier une livraison
router.post(
  "/",
  authenticate,
  authorize("planification", "admin"),
  async (req, res) => {
    try {
      const { deliveryDate, orderId, driverId, depotId, notes } = req.body;
      if (!deliveryDate || !orderId)
        return res
          .status(400)
          .json({ message: "deliveryDate et orderId requis" });

      // Vérifier qu'une livraison n'existe pas déjà pour cet ordre
      const existing = await Delivery.findOne({ where: { orderId } });
      if (existing)
        return res
          .status(409)
          .json({ message: "Une livraison existe déjà pour cette commande" });

      const delivery = await Delivery.create({
        deliveryDate,
        orderId,
        driverId,
        depotId,
        notes,
        assignedBy: req.user.id,
      });
      await Order.update({ status: "planned" }, { where: { id: orderId } });
      await log(req.user.id, "CREATE_DELIVERY", "Delivery", delivery.id, {
        orderId,
        driverId,
      });

      const full = await Delivery.findByPk(delivery.id, {
        include: [Order, Driver, Depot],
      });
      res.status(201).json(full);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur", error: err.message });
    }
  },
);

// PUT /api/deliveries/:id — affecter/modifier
router.put(
  "/:id",
  authenticate,
  authorize("planification", "transport", "admin"),
  async (req, res) => {
    try {
      const delivery = await Delivery.findByPk(req.params.id);
      if (!delivery)
        return res.status(404).json({ message: "Livraison introuvable" });
      await delivery.update(req.body);
      await log(
        req.user.id,
        "UPDATE_DELIVERY",
        "Delivery",
        delivery.id,
        req.body,
      );
      res.json(delivery);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur", error: err.message });
    }
  },
);

module.exports = router;
