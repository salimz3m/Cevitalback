const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const sequelize = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");
const { log } = require("../utils/audit");
const {
  PlanifSession,
  LignePlanif,
  Order,
  OrderItem,
  Plateforme,
  CLR,
  User,
} = require("../models");

const CAN_PLANIF = ["admin", "planification"];

// GET /api/planification/sessions
router.get(
  "/sessions",
  authenticate,
  authorize(...CAN_PLANIF),
  async (req, res) => {
    try {
      const sessions = await PlanifSession.findAll({
        where: { companyId: req.user.companyId },
        include: [
          { model: User, as: "createur", attributes: ["id", "email"] },
          {
            model: LignePlanif,
            as: "lignes",
            include: [
              {
                model: Order,
                as: "order",
                attributes: ["id", "orderNumber", "status"],
              },
              {
                model: Plateforme,
                as: "plateforme",
                attributes: ["id", "nom", "region"],
              },
              {
                model: CLR,
                as: "clr",
                attributes: ["id", "code", "nom", "wilaya"],
              },
            ],
          },
        ],
        order: [["date", "DESC"]],
      });
      res.json(sessions);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// GET /api/planification/sessions/:id
router.get(
  "/sessions/:id",
  authenticate,
  authorize(...CAN_PLANIF),
  async (req, res) => {
    try {
      const session = await PlanifSession.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
        include: [
          { model: User, as: "createur", attributes: ["id", "email"] },
          {
            model: LignePlanif,
            as: "lignes",
            include: [
              {
                model: Order,
                as: "order",
                include: [
                  {
                    model: OrderItem,
                    attributes: ["productName", "quantity", "unit"],
                  },
                ],
              },
              { model: Plateforme, as: "plateforme" },
              { model: CLR, as: "clr" },
            ],
          },
        ],
      });
      if (!session)
        return res.status(404).json({ message: "Session introuvable" });
      res.json(session);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// POST /api/planification/sessions
router.post(
  "/sessions",
  authenticate,
  authorize(...CAN_PLANIF),
  async (req, res) => {
    try {
      const { date, notes } = req.body;
      if (!date)
        return res.status(400).json({ message: "La date est requise" });

      const session = await PlanifSession.create({
        date,
        notes,
        statut: "BROUILLON",
        companyId: req.user.companyId,
        createurId: req.user.id,
      });

      await log(
        req.user.id,
        "PLANIF_SESSION_CREE",
        `Session créée pour le ${date}`,
      );
      res.status(201).json(session);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// POST /api/planification/sessions/:id/lignes  [CORRIGÉ — Bug #3]
router.post(
  "/sessions/:id/lignes",
  authenticate,
  authorize(...CAN_PLANIF),
  async (req, res) => {
    try {
      const { orderId, diapason, plateformeId, clrId, notes } = req.body;

      const session = await PlanifSession.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
      });
      if (!session)
        return res.status(404).json({ message: "Session introuvable" });
      if (session.statut !== "BROUILLON")
        return res.status(400).json({
          message: "Impossible de modifier une session validée ou envoyée",
        });

      if (!["D1", "D2"].includes(diapason))
        return res
          .status(400)
          .json({ message: "Diapason invalide (D1 ou D2)" });
      if (diapason === "D1" && !plateformeId)
        return res
          .status(400)
          .json({ message: "Diapason D1 requiert une plateforme" });

      const order = await Order.findOne({
        where: { id: orderId, companyId: req.user.companyId },
      });
      if (!order)
        return res.status(404).json({ message: "Commande introuvable" });

      const clr = await CLR.findByPk(clrId);
      if (!clr) return res.status(404).json({ message: "CLR introuvable" });

      if (diapason === "D1") {
        const plat = await Plateforme.findByPk(plateformeId);
        if (!plat)
          return res.status(404).json({ message: "Plateforme introuvable" });
      }

      // ✅ BUG #3 CORRIGÉ — vérification doublon inter-sessions
      const doublonGlobal = await LignePlanif.findOne({
        where: { orderId },
        include: [
          {
            model: PlanifSession,
            as: "session",
            where: {
              companyId: req.user.companyId,
              statut: { [Op.in]: ["BROUILLON", "VALIDEE", "ENVOYEE"] },
            },
            required: true,
          },
        ],
      });
      if (doublonGlobal) {
        return res.status(400).json({
          message: `Cette commande est déjà planifiée (session #${doublonGlobal.sessionId})`,
        });
      }

      const ligne = await LignePlanif.create({
        sessionId: session.id,
        orderId,
        diapason,
        plateformeId: diapason === "D1" ? plateformeId : null,
        clrId,
        notes,
        statut: "PLANIFIEE",
      });

      const ligneComplete = await LignePlanif.findByPk(ligne.id, {
        include: [
          { model: Order, as: "order", attributes: ["id", "orderNumber"] },
          {
            model: Plateforme,
            as: "plateforme",
            attributes: ["id", "nom", "region"],
          },
          {
            model: CLR,
            as: "clr",
            attributes: ["id", "code", "nom", "wilaya"],
          },
        ],
      });

      await log(
        req.user.id,
        "PLANIF_LIGNE_AJOUTEE",
        `Commande ${order.orderNumber} → ${diapason} → CLR ${clr.code}`,
      );

      res.status(201).json(ligneComplete);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// DELETE /api/planification/sessions/:id/lignes/:ligneId
router.delete(
  "/sessions/:id/lignes/:ligneId",
  authenticate,
  authorize(...CAN_PLANIF),
  async (req, res) => {
    try {
      const session = await PlanifSession.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
      });
      if (!session)
        return res.status(404).json({ message: "Session introuvable" });
      if (session.statut !== "BROUILLON")
        return res
          .status(400)
          .json({ message: "Impossible de modifier une session validée" });

      const ligne = await LignePlanif.findOne({
        where: { id: req.params.ligneId, sessionId: session.id },
      });
      if (!ligne) return res.status(404).json({ message: "Ligne introuvable" });

      await ligne.destroy();
      res.json({ message: "Ligne supprimée" });
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// PATCH /api/planification/sessions/:id/valider  [CORRIGÉ — Bug #2]
router.patch(
  "/sessions/:id/valider",
  authenticate,
  authorize(...CAN_PLANIF),
  async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const session = await PlanifSession.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
        include: [{ model: LignePlanif, as: "lignes" }],
        transaction,
      });
      if (!session) {
        await transaction.rollback();
        return res.status(404).json({ message: "Session introuvable" });
      }
      if (session.statut !== "BROUILLON") {
        await transaction.rollback();
        return res
          .status(400)
          .json({ message: "Session déjà validée ou envoyée" });
      }
      if (!session.lignes || session.lignes.length === 0) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ message: "La session ne contient aucune ligne" });
      }

      await session.update({ statut: "VALIDEE" }, { transaction });
      await log(
        req.user.id,
        "PLANIF_SESSION_VALIDEE",
        `Session #${session.id} du ${session.date} validée avec ${session.lignes.length} ligne(s)`,
      );

      await transaction.commit();
      res.json({ message: "Session validée", session });
    } catch (err) {
      await transaction.rollback();
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// PATCH /api/planification/sessions/:id/envoyer
router.patch(
  "/sessions/:id/envoyer",
  authenticate,
  authorize(...CAN_PLANIF),
  async (req, res) => {
    try {
      const session = await PlanifSession.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
        include: [{ model: LignePlanif, as: "lignes" }],
      });
      if (!session)
        return res.status(404).json({ message: "Session introuvable" });
      if (session.statut !== "VALIDEE")
        return res
          .status(400)
          .json({ message: "La session doit être validée avant envoi" });

      await LignePlanif.update(
        { statut: "ENVOYEE_TRANSPORT" },
        { where: { sessionId: session.id } },
      );
      await session.update({ statut: "ENVOYEE" });

      await log(
        req.user.id,
        "PLANIF_SESSION_ENVOYEE",
        `Session #${session.id} envoyée au transport — ${session.lignes.length} ligne(s)`,
      );

      res.json({ message: "Session envoyée au transport", session });
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// GET /api/planification/commandes-disponibles  [CORRIGÉ — Bug #1]
router.get(
  "/commandes-disponibles",
  authenticate,
  authorize(...CAN_PLANIF),
  async (req, res) => {
    try {
      // ✅ BUG #1 CORRIGÉ — une seule requête avec join au lieu de N+1
      const lignesActives = await LignePlanif.findAll({
        attributes: ["orderId"],
        include: [
          {
            model: PlanifSession,
            as: "session",
            attributes: [],
            where: {
              companyId: req.user.companyId,
              statut: { [Op.in]: ["BROUILLON", "VALIDEE", "ENVOYEE"] },
            },
            required: true,
          },
        ],
        raw: true,
      });
      const orderIdsPlanifies = [
        ...new Set(lignesActives.map((l) => l.orderId)),
      ];

      const orders = await Order.findAll({
        where: {
          companyId: req.user.companyId,
          status: "pending",
          ...(orderIdsPlanifies.length > 0 && {
            id: { [Op.notIn]: orderIdsPlanifies },
          }),
        },
        include: [
          { model: OrderItem, attributes: ["productName", "quantity", "unit"] },
        ],
        order: [["date", "ASC"]],
      });

      res.json(orders);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

module.exports = router;
