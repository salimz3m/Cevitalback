// routes/stock.js — REFONDU Sprint 7
const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const { authenticate, authorize } = require("../middleware/auth");
const {
  ajusterManuellement,
  detecterRuptures,
  getStockGlobal,
} = require("../services/stockService");
const {
  Produit,
  StockCLR,
  MouvementStock,
  SeuilAlerte,
  CLR,
  User,
} = require("../models");
const { logAction } = require("../utils/audit");

const CAN_STOCK = ["admin", "planification", "transport", "keep_contact"];
const ADMIN_ONLY = ["admin"];

// ─────────────────────────────────────────────────────────────
// GET /api/stock
// Stock global tous CLR — filtrable par clrId, famille, produitId
// ─────────────────────────────────────────────────────────────
router.get("/", authenticate, authorize(...CAN_STOCK), async (req, res) => {
  try {
    const { clrId, famille, produitId } = req.query;
    const stocks = await getStockGlobal(req.user.companyId, {
      clrId: clrId ? parseInt(clrId) : undefined,
      famille: famille || undefined,
      produitId: produitId ? parseInt(produitId) : undefined,
    });

    // Enrichir avec statut seuil
    const seuils = await SeuilAlerte.findAll({
      where: { companyId: req.user.companyId, actif: true },
    });
    const seuilMap = {};
    for (const s of seuils) {
      const key = `${s.produitId}_${s.clrId || "global"}`;
      seuilMap[key] = s;
    }

    const enriched = stocks.map((s) => {
      const keySpecifique = `${s.produitId}_${s.clrId}`;
      const keyGlobal = `${s.produitId}_global`;
      const seuil = seuilMap[keySpecifique] || seuilMap[keyGlobal] || null;

      let statutStock = "OK";
      if (seuil) {
        const warning =
          seuil.seuilWarning || (seuil.seuilMinimum + seuil.seuilOptimal) / 2;
        if (s.qteDisponible <= seuil.seuilMinimum) statutStock = "RUPTURE";
        else if (s.qteDisponible <= warning) statutStock = "WARNING";
      }

      return {
        ...s.toJSON(),
        seuil: seuil
          ? {
              minimum: seuil.seuilMinimum,
              optimal: seuil.seuilOptimal,
              warning: seuil.seuilWarning,
            }
          : null,
        statutStock,
        qteAttendue: s.qteDisponible + s.qteReservee,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/stock/carte
// Données optimisées pour la carte géographique
// Retourne par CLR : nb produits, niveaux, alertes
// ─────────────────────────────────────────────────────────────
router.get(
  "/carte",
  authenticate,
  authorize(...CAN_STOCK),
  async (req, res) => {
    try {
      const clrs = await CLR.findAll({
        include: [
          {
            model: StockCLR,
            as: "stocks",
            required: false,
            where: { companyId: req.user.companyId },
            include: [
              {
                model: Produit,
                as: "produit",
                where: { actif: true },
                required: true,
              },
            ],
          },
        ],
      });

      const ruptures = await detecterRuptures(req.user.companyId);
      const rupturesParCLR = {};
      for (const r of ruptures) {
        const key = r.clr?.id;
        if (key) {
          if (!rupturesParCLR[key])
            rupturesParCLR[key] = { critiques: 0, warnings: 0 };
          if (r.niveau === "CRITIQUE") rupturesParCLR[key].critiques++;
          else rupturesParCLR[key].warnings++;
        }
      }

      const carte = clrs.map((clr) => {
        const nbProduits = clr.stocks?.length || 0;
        const valeurStock = (clr.stocks || []).reduce((sum, s) => {
          return sum + s.qteDisponible * (s.produit?.prixUnitaireDZD || 0);
        }, 0);
        const alerts = rupturesParCLR[clr.id] || { critiques: 0, warnings: 0 };
        const statutGlobal =
          alerts.critiques > 0
            ? "CRITIQUE"
            : alerts.warnings > 0
              ? "WARNING"
              : nbProduits === 0
                ? "VIDE"
                : "OK";

        return {
          id: clr.id,
          code: clr.code,
          nom: clr.nom,
          wilaya: clr.wilaya,
          region: clr.region,
          lat: clr.latitude,
          lng: clr.longitude,
          nbProduits,
          valeurStockDZD: Math.round(valeurStock),
          alertesCritiques: alerts.critiques,
          alertesWarnings: alerts.warnings,
          statutGlobal,
        };
      });

      res.json(carte);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/stock/clr/:clrId
// Stock détail d'un CLR spécifique, tous produits
// ─────────────────────────────────────────────────────────────
// ─── GET /api/stock/clr/:clrId ───
router.get(
  "/clr/:clrId",
  authenticate,
  authorize(...CAN_STOCK),
  async (req, res) => {
    try {
      const clrId = parseInt(req.params.clrId);
      // ✅ Ajoute cette garde
      if (isNaN(clrId))
        return res.status(400).json({ message: "clrId invalide" });

      const stocks = await getStockGlobal(req.user.companyId, { clrId });
      const clr = await CLR.findByPk(clrId);
      if (!clr) return res.status(404).json({ message: "CLR introuvable" });
      res.json({ clr, stocks: stocks.map((s) => s.toJSON()) });
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);
// ─────────────────────────────────────────────────────────────
// GET /api/stock/produit/:sku
// Stock d'un produit sur tous les CLR
// ─────────────────────────────────────────────────────────────
router.get(
  "/produit/:sku",
  authenticate,
  authorize(...CAN_STOCK),
  async (req, res) => {
    try {
      const produit = await Produit.findOne({
        where: { sku: req.params.sku, companyId: req.user.companyId },
      });
      if (!produit)
        return res.status(404).json({ message: "Produit introuvable" });

      const stocks = await getStockGlobal(req.user.companyId, {
        produitId: produit.id,
      });
      res.json({ produit, stocks: stocks.map((s) => s.toJSON()) });
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/stock/alertes
// Tous les produits sous seuil (ruptures + warnings)
// ─────────────────────────────────────────────────────────────
router.get(
  "/alertes",
  authenticate,
  authorize(...CAN_STOCK),
  async (req, res) => {
    try {
      const alertes = await detecterRuptures(req.user.companyId);
      res.json({
        alertes,
        nbCritiques: alertes.filter((a) => a.niveau === "CRITIQUE").length,
        nbWarnings: alertes.filter((a) => a.niveau === "WARNING").length,
        total: alertes.length,
      });
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/stock/mouvements
// Journal complet — filtrable
// ?clrId=&produitId=&type=&dateDebut=&dateFin=&page=&limit=
// ─────────────────────────────────────────────────────────────
router.get(
  "/mouvements",
  authenticate,
  authorize(...CAN_STOCK),
  async (req, res) => {
    try {
      const {
        clrId,
        produitId,
        type,
        dateDebut,
        dateFin,
        page = 1,
        limit = 50,
      } = req.query;
      const where = { companyId: req.user.companyId };
      if (clrId) {
        const clrIdInt = parseInt(clrId);
        if (isNaN(clrIdInt))
          return res.status(400).json({ message: "clrId invalide" });
        where.clrId = clrIdInt;
      }
      if (produitId) {
        const produitIdInt = parseInt(produitId);
        if (isNaN(produitIdInt))
          return res.status(400).json({ message: "produitId invalide" });
        where.produitId = produitIdInt;
      }
      if (type) where.type = type;
      if (dateDebut || dateFin) {
        where.createdAt = {};
        if (dateDebut) where.createdAt[Op.gte] = new Date(dateDebut);
        if (dateFin) where.createdAt[Op.lte] = new Date(dateFin);
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);
      const { count, rows } = await MouvementStock.findAndCountAll({
        where,
        include: [
          {
            model: Produit,
            as: "produit",
            attributes: ["id", "sku", "nom", "famille"],
          },
          {
            model: CLR,
            as: "clr",
            attributes: ["id", "code", "nom", "wilaya"],
          },
          { model: User, as: "user", attributes: ["id", "email"] },
        ],
        order: [["createdAt", "DESC"]],
        limit: parseInt(limit),
        offset,
      });

      res.json({
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
        mouvements: rows,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/stock/ajustement
// Ajustement manuel (admin seulement)
// Body: { produitId, clrId, quantite, notes }
// ─────────────────────────────────────────────────────────────
router.post(
  "/ajustement",
  authenticate,
  authorize(...ADMIN_ONLY),
  async (req, res) => {
    try {
      const { produitId, clrId, quantite, notes } = req.body;
      if (!produitId || !clrId || quantite === undefined)
        return res
          .status(400)
          .json({ message: "produitId, clrId et quantite sont requis" });

      await ajusterManuellement({
        produitId: parseInt(produitId),
        clrId: parseInt(clrId),
        companyId: req.user.companyId,
        quantite: parseFloat(quantite),
        userId: req.user.id,
        notes,
      });

      await logAction(
        req.user.id,
        "STOCK_AJUSTEMENT_MANUEL",
        `Ajustement ${quantite > 0 ? "+" : ""}${quantite} sur produit #${produitId} CLR #${clrId}`,
      );

      res.json({ message: "Ajustement appliqué" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message || "Erreur serveur" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/stock/produits
// Catalogue produits de la company
// ─────────────────────────────────────────────────────────────
router.get(
  "/produits",
  authenticate,
  authorize(...CAN_STOCK),
  async (req, res) => {
    try {
      const { famille, actif } = req.query;
      const where = { companyId: req.user.companyId };
      if (famille) where.famille = famille;
      if (actif !== undefined) where.actif = actif === "true";

      const produits = await Produit.findAll({
        where,
        order: [
          ["famille", "ASC"],
          ["nom", "ASC"],
        ],
      });
      res.json(produits);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/stock/produits
// Créer un produit (admin)
// ─────────────────────────────────────────────────────────────
router.post(
  "/produits",
  authenticate,
  authorize(...ADMIN_ONLY),
  async (req, res) => {
    try {
      const {
        sku,
        nom,
        famille,
        marque,
        unite,
        qteParCarton,
        poidsKg,
        prixUnitaireDZD,
        qteParPalette,
        description,
      } = req.body;
      if (!sku || !nom || !famille)
        return res
          .status(400)
          .json({ message: "sku, nom et famille sont requis" });

      const existing = await Produit.findOne({
        where: { sku, companyId: req.user.companyId },
      });
      if (existing)
        return res.status(400).json({ message: `SKU "${sku}" déjà utilisé` });

      const produit = await Produit.create({
        sku,
        nom,
        famille,
        marque,
        unite: unite || "carton",
        qteParCarton,
        poidsKg,
        prixUnitaireDZD,
        qteParPalette,
        description,
        actif: true,
        companyId: req.user.companyId,
      });

      res.status(201).json(produit);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// PUT /api/stock/produits/:id
router.put(
  "/produits/:id",
  authenticate,
  authorize(...ADMIN_ONLY),
  async (req, res) => {
    try {
      const produit = await Produit.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
      });
      if (!produit)
        return res.status(404).json({ message: "Produit introuvable" });
      await produit.update(req.body);
      res.json(produit);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/stock/seuils
// Seuils d'alerte
// ─────────────────────────────────────────────────────────────
router.get(
  "/seuils",
  authenticate,
  authorize(...ADMIN_ONLY),
  async (req, res) => {
    try {
      const seuils = await SeuilAlerte.findAll({
        where: { companyId: req.user.companyId },
        include: [
          {
            model: Produit,
            as: "produit",
            attributes: ["id", "sku", "nom", "famille"],
          },
          { model: CLR, as: "clr", attributes: ["id", "code", "nom"] },
        ],
      });
      res.json(seuils);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// PUT /api/stock/seuils  (upsert)
router.put(
  "/seuils",
  authenticate,
  authorize(...ADMIN_ONLY),
  async (req, res) => {
    try {
      const { produitId, clrId, seuilMinimum, seuilOptimal, seuilWarning } =
        req.body;
      if (
        !produitId ||
        seuilMinimum === undefined ||
        seuilOptimal === undefined
      )
        return res.status(400).json({
          message: "produitId, seuilMinimum et seuilOptimal sont requis",
        });

      const [seuil] = await SeuilAlerte.findOrCreate({
        where: {
          produitId,
          clrId: clrId || null,
          companyId: req.user.companyId,
        },
        defaults: {
          produitId,
          clrId: clrId || null,
          companyId: req.user.companyId,
          seuilMinimum,
          seuilOptimal,
          seuilWarning,
          actif: true,
        },
      });
      await seuil.update({
        seuilMinimum,
        seuilOptimal,
        seuilWarning,
        actif: true,
      });
      res.json(seuil);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);
// DELETE /api/stock/produits/:id
router.delete(
  "/produits/:id",
  authenticate,
  authorize(...ADMIN_ONLY),
  async (req, res) => {
    try {
      const produit = await Produit.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
      });
      if (!produit)
        return res.status(404).json({ message: "Produit introuvable" });
      await produit.update({ actif: false }); // soft delete
      res.json({ message: "Produit désactivé" });
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// DELETE /api/stock/seuils/:id
router.delete(
  "/seuils/:id",
  authenticate,
  authorize(...ADMIN_ONLY),
  async (req, res) => {
    try {
      const seuil = await SeuilAlerte.findOne({
        where: { id: req.params.id, companyId: req.user.companyId },
      });
      if (!seuil) return res.status(404).json({ message: "Seuil introuvable" });
      await seuil.destroy();
      res.json({ message: "Seuil supprimé" });
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

module.exports = router;
