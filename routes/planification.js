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
  Produit,
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
                include: [
                  {
                    model: OrderItem,
                    as: "OrderItems",
                    attributes: [
                      "id",
                      "productName",
                      "quantity",
                      "unit",
                      "sku",
                      "produitId",
                    ],
                    include: [
                      {
                        model: Produit,
                        as: "produit",
                        attributes: [
                          "id",
                          "sku",
                          "nom",
                          "poidsKg",
                          "qteParCarton",
                          "qteParPalette",
                          "famille",
                        ],
                        required: false,
                      },
                    ],
                  },
                ],
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

// POST /api/planification/sessions/:id/lignes
router.post(
  "/sessions/:id/lignes",
  authenticate,
  authorize(...CAN_PLANIF),
  async (req, res) => {
    try {
      const {
        orderId,
        diapason,
        plateformeId,
        clrId,
        clrSourceId,
        notes,
        itemsSelectionnes,
      } = req.body;

      const session = await PlanifSession.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
      });
      if (!session)
        return res.status(404).json({ message: "Session introuvable" });
      if (session.statut !== "BROUILLON")
        return res.status(400).json({ message: "Session non modifiable" });

      if (!["D1", "D2", "D3", "D4", "D5"].includes(diapason))
        return res.status(400).json({ message: "Diapason invalide" });
      if (diapason === "D1" && !plateformeId)
        return res.status(400).json({ message: "Plateforme requise pour D1" });

      // ✅ orderId optionnel
      let order = null;
      if (orderId) {
        order = await Order.findOne({
          where: { id: orderId, companyId: req.user.companyId },
        });
        if (!order)
          return res.status(404).json({ message: "Commande introuvable" });
      }

      // ✅ CLR requis sauf D4
      if (diapason !== "D4") {
        const clr = await CLR.findByPk(clrId);
        if (!clr) return res.status(404).json({ message: "CLR introuvable" });
      }

      if (["D1", "D4", "D5"].includes(diapason)) {
        const plat = await Plateforme.findByPk(plateformeId);
        if (!plat)
          return res.status(404).json({ message: "Plateforme introuvable" });
      }

      // ✅ Vérification doublon uniquement si commande présente
      if (orderId) {
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
            message: `Commande déjà planifiée (session #${doublonGlobal.sessionId})`,
          });
        }
      }

      // ✅ Valider qu'il y a au moins un item
      if (!itemsSelectionnes || itemsSelectionnes.length === 0)
        return res.status(400).json({ message: "Aucun article sélectionné" });
      // PAR
      const itemsJsonNormalise = await Promise.all(
        itemsSelectionnes.map(async (item) => {
          if (item.libre) {
            return {
              produitId: item.produitId,
              quantitePlanifiee: item.quantitePlanifiee,
              libre: true,
              sku: item.sku ?? null,
              nom: item.nom ?? null,
              famille: item.famille ?? null,
              poidsKg: item.poidsKg ?? null,
              qteParCarton: item.qteParCarton ?? null,
              qteParPalette: item.qteParPalette ?? null,
            };
          }
          // Pour les non-libres : récupérer le produitId depuis OrderItem
          const oi = await OrderItem.findByPk(item.orderItemId, {
            attributes: ["produitId"],
          });
          return {
            orderItemId: item.orderItemId,
            quantitePlanifiee: item.quantitePlanifiee,
            libre: false,
            produitId: oi?.produitId ?? null, // ← ajout pour cohérence
          };
        }),
      );

      const ligne = await LignePlanif.create({
        sessionId: session.id,
        orderId: orderId || null,
        diapason,
        plateformeId: ["D1", "D4", "D5"].includes(diapason)
          ? plateformeId
          : null,
        clrId: diapason !== "D4" ? clrId : null,
        clrSourceId: ["D3", "D5"].includes(diapason) ? clrSourceId : null,
        notes,
        statut: "PLANIFIEE",
        itemsJson: itemsJsonNormalise,
      });

      const ligneComplete = await LignePlanif.findByPk(ligne.id, {
        include: [
          {
            model: Order,
            as: "order",
            attributes: ["id", "orderNumber"],
            include: [
              {
                model: OrderItem,
                as: "OrderItems",
                attributes: ["id", "productName", "quantity", "unit", "sku"],
              },
            ],
          },
          { model: Plateforme, as: "plateforme", attributes: ["id", "nom"] },
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
        `Ligne ajoutée → ${diapason}${order ? ` — commande ${order.orderNumber}` : " — sans commande"}`,
      );

      res.status(201).json(ligneComplete);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ✅ PUT /api/planification/sessions/:id/lignes/:ligneId  (ROUTE MANQUANTE)
router.put(
  "/sessions/:id/lignes/:ligneId",
  authenticate,
  authorize(...CAN_PLANIF),
  async (req, res) => {
    try {
      const {
        orderId,
        diapason,
        plateformeId,
        clrId,
        clrSourceId,
        notes,
        itemsSelectionnes,
      } = req.body;

      const session = await PlanifSession.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
      });
      if (!session)
        return res.status(404).json({ message: "Session introuvable" });

      // ✅ BROUILLON et VALIDÉE sont modifiables
      if (!["BROUILLON", "VALIDEE"].includes(session.statut))
        return res.status(400).json({ message: "Session non modifiable" });

      const ligne = await LignePlanif.findOne({
        where: { id: req.params.ligneId, sessionId: session.id },
      });
      if (!ligne) return res.status(404).json({ message: "Ligne introuvable" });

      if (!["D1", "D2", "D3", "D4", "D5"].includes(diapason))
        return res.status(400).json({ message: "Diapason invalide" });

      // ✅ orderId optionnel
      if (orderId) {
        const order = await Order.findOne({
          where: { id: orderId, companyId: req.user.companyId },
        });
        if (!order)
          return res.status(404).json({ message: "Commande introuvable" });

        // Doublon : exclure la ligne elle-même
        const doublon = await LignePlanif.findOne({
          where: { orderId, id: { [Op.ne]: ligne.id } },
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
        if (doublon)
          return res.status(400).json({
            message: `Commande déjà planifiée (session #${doublon.sessionId})`,
          });
      }

      if (!itemsSelectionnes || itemsSelectionnes.length === 0)
        return res.status(400).json({ message: "Aucun article sélectionné" });
      // PAR
      const itemsJsonNormalise = await Promise.all(
        itemsSelectionnes.map(async (item) => {
          if (item.libre) {
            return {
              produitId: item.produitId,
              quantitePlanifiee: item.quantitePlanifiee,
              libre: true,
              sku: item.sku ?? null,
              nom: item.nom ?? null,
              famille: item.famille ?? null,
              poidsKg: item.poidsKg ?? null,
              qteParCarton: item.qteParCarton ?? null,
              qteParPalette: item.qteParPalette ?? null,
            };
          }
          const oi = await OrderItem.findByPk(item.orderItemId, {
            attributes: ["produitId"],
          });
          return {
            orderItemId: item.orderItemId,
            quantitePlanifiee: item.quantitePlanifiee,
            libre: false,
            produitId: oi?.produitId ?? null,
          };
        }),
      );

      await ligne.update({
        orderId: orderId || null,
        diapason,
        plateformeId: ["D1", "D4", "D5"].includes(diapason)
          ? plateformeId
          : null,
        clrId: diapason !== "D4" ? clrId : null,
        clrSourceId: ["D3", "D5"].includes(diapason) ? clrSourceId : null,
        notes,
        itemsJson: itemsJsonNormalise,
      });

      const ligneComplete = await LignePlanif.findByPk(ligne.id, {
        include: [
          {
            model: Order,
            as: "order",
            attributes: ["id", "orderNumber"],
            include: [
              {
                model: OrderItem,
                as: "OrderItems",
                attributes: ["id", "productName", "quantity", "unit", "sku"],
              },
            ],
          },
          { model: Plateforme, as: "plateforme", attributes: ["id", "nom"] },
          {
            model: CLR,
            as: "clr",
            attributes: ["id", "code", "nom", "wilaya"],
          },
        ],
      });

      await log(
        req.user.id,
        "PLANIF_LIGNE_MODIFIEE",
        `Ligne #${ligne.id} modifiée`,
      );

      res.json(ligneComplete);
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
      if (!["BROUILLON", "VALIDEE"].includes(session.statut))
        // ← après
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
          {
            model: OrderItem,
            as: "OrderItems",
            attributes: [
              "id",
              "productName",
              "quantity",
              "unit",
              "sku",
              "produitId",
            ],
            include: [
              {
                model: Produit,
                as: "produit",
                attributes: [
                  "id",
                  "sku",
                  "nom",
                  "poidsKg",
                  "qteParCarton",
                  "qteParPalette",
                  "famille",
                ],
                required: false,
              },
            ],
          },
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
