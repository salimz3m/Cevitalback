// routes/transport.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const { log } = require("../utils/audit");
const { confirmerLivraison } = require("../services/stockService");
const {
  OrdreTransport,
  SuiviTransport,
  LignePlanif,
  PlanifSession,
  Order,
  OrderItem,
  User,
  CLR,
  Plateforme,
  Produit,
} = require("../models");

// Rôles autorisés pour le module transport
const CAN_TRANSPORT = ["admin", "transport"];
const CAN_PLANIF = ["admin", "planification", "transport"];

// ─────────────────────────────────────────────────────────────
// GET /api/transport/ordres
// Liste tous les ordres de transport de la company
// ─────────────────────────────────────────────────────────────
router.get(
  "/ordres",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const { statut } = req.query;

      const where = { companyId: req.user.companyId };
      if (statut) where.statut = statut;

      const ordres = await OrdreTransport.findAll({
        where,
        include: [
          {
            model: SuiviTransport,
            as: "suivis",
            order: [["createdAt", "DESC"]],
            limit: 1, // dernier événement uniquement pour la liste
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      res.json(ordres);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/transport/ordres/:id
// Détail d'un ordre avec toutes ses lignes et son historique
// ─────────────────────────────────────────────────────────────
router.get(
  "/ordres/:id",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const ordre = await OrdreTransport.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
        include: [
          {
            model: SuiviTransport,
            as: "suivis",
            order: [["createdAt", "DESC"]],
          },
        ],
      });

      if (!ordre) return res.status(404).json({ message: "Ordre introuvable" });

      // Récupérer les lignes de planif associées
      const lignes = await LignePlanif.findAll({
        where: { id: ordre.lignesPlanifIds },
        include: [
          {
            model: Order,
            as: "order",
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
            model: CLR,
            as: "clr",
            attributes: ["id", "code", "nom", "wilaya", "region"],
          },
          { model: Plateforme, as: "plateforme", attributes: ["id", "nom"] },
        ],
      });

      res.json({ ...ordre.toJSON(), lignesPlanif: lignes });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/transport/ordres
// Créer un ordre de transport depuis une session validée/envoyée
// Body: { sessionId, lignesPlanifIds[], prestataire?, vehicule?, dateDepart?, dateArriveePrevue?, notes? }
// ─────────────────────────────────────────────────────────────
router.post(
  "/ordres",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const {
        sessionId,
        lignesPlanifIds,
        prestataire,
        vehicule,
        capaciteChargee,
        dateDepart,
        dateArriveePrevue,
        notes,
      } = req.body;

      if (!sessionId || !lignesPlanifIds || lignesPlanifIds.length === 0) {
        return res
          .status(400)
          .json({ message: "sessionId et lignesPlanifIds sont requis" });
      }

      // Vérif session appartient à la company et est VALIDEE ou ENVOYEE
      const session = await PlanifSession.findOne({
        where: { id: sessionId, companyId: req.user.companyId },
      });
      if (!session)
        return res.status(404).json({ message: "Session introuvable" });
      if (!["VALIDEE", "ENVOYEE"].includes(session.statut)) {
        return res
          .status(400)
          .json({ message: "La session doit être VALIDÉE ou ENVOYÉE" });
      }

      // Vérif toutes les lignes existent et appartiennent à cette session
      const lignes = await LignePlanif.findAll({
        where: { id: lignesPlanifIds, sessionId },
      });
      if (lignes.length !== lignesPlanifIds.length) {
        return res.status(400).json({
          message:
            "Certaines lignes sont invalides ou n'appartiennent pas à cette session",
        });
      }

      // Vérif qu'elles ne sont pas déjà dans un ordre actif
      for (const ligne of lignes) {
        if (ligne.statut === "LIVREE") {
          return res.status(400).json({
            message: `La ligne #${ligne.id} est déjà livrée`,
          });
        }
      }

      // Déterminer le CLR de destination
      // Toutes les lignes doivent avoir le même CLR pour un ordre
      const clrIds = [...new Set(lignes.map((l) => l.clrId))];
      if (clrIds.length > 1) {
        return res.status(400).json({
          message:
            "Toutes les lignes d'un ordre doivent avoir le même CLR de destination",
        });
      }

      const ordre = await OrdreTransport.create({
        sessionId,
        lignesPlanifIds,
        clrId: clrIds[0],
        prestataire: prestataire || null,
        vehicule: vehicule || null,
        capaciteChargee: capaciteChargee || null,
        dateDepart: dateDepart || null,
        dateArriveePrevue: dateArriveePrevue || null,
        statut: "CREE",
        companyId: req.user.companyId,
        notes: notes || null,
      });

      // Premier événement de suivi automatique
      await SuiviTransport.create({
        ordreId: ordre.id,
        statut: "CREE",
        commentaire: "Ordre de transport créé",
        createdBy: req.user.id,
      });

      await log(
        req.user.id,
        "TRANSPORT_ORDRE_CREE",
        `Ordre #${ordre.id} créé pour la session #${sessionId} — ${lignesPlanifIds.length} ligne(s) — CLR ${clrIds[0]}`,
      );

      res.status(201).json(ordre);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/transport/ordres/:id/affecter
// Affecter un prestataire / véhicule à un ordre CREE
// Body: { prestataire, vehicule, capaciteChargee, dateDepart, dateArriveePrevue }
// ─────────────────────────────────────────────────────────────
router.patch(
  "/ordres/:id/affecter",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const {
        prestataire,
        vehicule,
        capaciteChargee,
        dateDepart,
        dateArriveePrevue,
      } = req.body;

      const ordre = await OrdreTransport.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
      });
      if (!ordre) return res.status(404).json({ message: "Ordre introuvable" });
      if (!["CREE"].includes(ordre.statut)) {
        return res
          .status(400)
          .json({ message: "Seul un ordre en statut CREE peut être modifié" });
      }

      await ordre.update({
        prestataire,
        vehicule,
        capaciteChargee,
        dateDepart,
        dateArriveePrevue,
      });

      await log(
        req.user.id,
        "TRANSPORT_ORDRE_AFFECTE",
        `Ordre #${ordre.id} — prestataire: ${prestataire}, véhicule: ${vehicule}`,
      );

      res.json(ordre);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/transport/ordres/:id/demarrer
// Démarre la livraison → EN_ROUTE
// ─────────────────────────────────────────────────────────────
router.patch(
  "/ordres/:id/demarrer",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const { position, commentaire } = req.body;

      const ordre = await OrdreTransport.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
      });
      if (!ordre) return res.status(404).json({ message: "Ordre introuvable" });
      if (ordre.statut !== "CREE") {
        return res
          .status(400)
          .json({ message: "L'ordre doit être en statut CREE pour démarrer" });
      }
      if (!ordre.prestataire || !ordre.vehicule) {
        return res.status(400).json({
          message: "Affecter un prestataire et un véhicule avant de démarrer",
        });
      }

      await ordre.update({
        statut: "EN_ROUTE",
        dateDepart: ordre.dateDepart || new Date(),
      });

      await SuiviTransport.create({
        ordreId: ordre.id,
        statut: "EN_ROUTE",
        position: position || null,
        commentaire: commentaire || "Livraison démarrée",
        createdBy: req.user.id,
      });

      // Mettre à jour les orders associés → in_transit
      const lignes = await LignePlanif.findAll({
        where: { id: ordre.lignesPlanifIds },
      });
      const orderIds = [...new Set(lignes.map((l) => l.orderId))];
      await Order.update({ status: "in_transit" }, { where: { id: orderIds } });

      await log(
        req.user.id,
        "TRANSPORT_DEMARRE",
        `Ordre #${ordre.id} en route`,
      );

      res.json(ordre);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/transport/ordres/:id/suivi
// Ajouter un événement de suivi (position, commentaire)
// ─────────────────────────────────────────────────────────────
router.post(
  "/ordres/:id/suivi",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const { statut, position, commentaire } = req.body;

      const ordre = await OrdreTransport.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
      });
      if (!ordre) return res.status(404).json({ message: "Ordre introuvable" });
      if (ordre.statut === "LIVRE") {
        return res
          .status(400)
          .json({ message: "Impossible d'ajouter un suivi à un ordre livré" });
      }

      const validStatuts = ["CREE", "EN_ROUTE", "INCIDENT"];
      if (statut && !validStatuts.includes(statut)) {
        return res.status(400).json({
          message: `Statut invalide. Valeurs : ${validStatuts.join(", ")}`,
        });
      }

      // Si changement de statut (ex: INCIDENT)
      if (statut && statut !== ordre.statut && statut !== "LIVRE") {
        await ordre.update({ statut });
      }

      const suivi = await SuiviTransport.create({
        ordreId: ordre.id,
        statut: statut || ordre.statut,
        position: position || null,
        commentaire: commentaire || null,
        createdBy: req.user.id,
      });

      res.status(201).json(suivi);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/transport/ordres/:id/confirmer
// ╔══════════════════════════════════════════════════════════╗
// ║  SEUL ENDPOINT QUI MET À JOUR LE STOCK                  ║
// ║  Délègue entièrement à stockService.confirmerLivraison   ║
// ╚══════════════════════════════════════════════════════════╝
// ─────────────────────────────────────────────────────────────
router.patch(
  "/ordres/:id/confirmer",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const result = await confirmerLivraison(
        parseInt(req.params.id),
        req.user.id,
        req.user.companyId,
      );

      await log(
        req.user.id,
        "TRANSPORT_LIVRE_CONFIRME",
        `Ordre #${req.params.id} livré — ${result.updated} produit(s) mis à jour au CLR ${result.clrId}`,
      );

      res.json({
        message: "Livraison confirmée et stock mis à jour",
        ...result,
      });
    } catch (err) {
      console.error(err);
      res
        .status(400)
        .json({ message: err.message || "Erreur lors de la confirmation" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/transport/sessions-disponibles
// Sessions VALIDEES ou ENVOYEES ayant des lignes non encore
// couvertes par un ordre de transport
// ─────────────────────────────────────────────────────────────
router.get(
  "/sessions-disponibles",
  authenticate,
  authorize(...CAN_TRANSPORT),
  async (req, res) => {
    try {
      const sessions = await PlanifSession.findAll({
        where: {
          companyId: req.user.companyId,
          statut: ["VALIDEE", "ENVOYEE"],
        },
        include: [
          {
            model: LignePlanif,
            as: "lignes",
            where: { statut: ["PLANIFIEE", "ENVOYEE_TRANSPORT"] },
            required: true,
            attributes: [
              "id",
              "sessionId",
              "orderId",
              "diapason",
              "clrId",
              "plateformeId",
              "statut",
              "itemsJson",
            ],
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
                        ],
                        required: false,
                      },
                    ],
                  },
                ],
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

module.exports = router;
