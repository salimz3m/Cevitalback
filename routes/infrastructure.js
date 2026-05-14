// routes/infrastructure.js
const express = require("express");
const router = express.Router();
const { Plateforme, CLR } = require("../models");
const { authenticate, authorize } = require("../middleware/auth");

// ── GET /api/infrastructure/plateformes ───────────────────────
// Retourne les 3 plateformes avec leurs CLR rattachés
router.get("/", authenticate, async (req, res) => {
  const plateformes = await Plateforme.findAll({
    where: { actif: true },
    include: [{ model: CLR, as: "clrs", required: false }],
  });

  res.json(plateformes);
});
router.get("/plateformes", authenticate, async (req, res) => {
  try {
    const plateformes = await Plateforme.findAll({
      where: { actif: true },
      include: [
        { model: CLR, as: "clrs", where: { actif: true }, required: false },
      ],
      order: [
        ["region", "ASC"],
        [{ model: CLR, as: "clrs" }, "code", "ASC"],
      ],
    });
    res.json(plateformes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ── GET /api/infrastructure/clrs ──────────────────────────────
// Retourne tous les CLR (utile pour les selects)
router.get("/clrs", authenticate, async (req, res) => {
  try {
    const clrs = await CLR.findAll({
      where: { actif: true },
      include: [
        {
          model: Plateforme,
          as: "plateforme",
          attributes: ["id", "nom", "region"],
        },
      ],
      order: [
        ["region", "ASC"],
        ["code", "ASC"],
      ],
    });
    res.json(clrs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ── GET /api/infrastructure/clrs/:region ──────────────────────
// Filtre par région (EST / CENTRE / OUEST)
router.get("/clrs/:region", authenticate, async (req, res) => {
  try {
    const region = req.params.region.toUpperCase();
    if (!["EST", "CENTRE", "OUEST"].includes(region))
      return res
        .status(400)
        .json({ message: "Région invalide. Valeurs : EST, CENTRE, OUEST" });

    const clrs = await CLR.findAll({
      where: { actif: true, region },
      include: [
        { model: Plateforme, as: "plateforme", attributes: ["id", "nom"] },
      ],
      order: [["code", "ASC"]],
    });
    res.json(clrs);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ── GET /api/infrastructure/summary ───────────────────────────
// Vue synthétique pour le dashboard admin
router.get("/summary", authenticate, async (req, res) => {
  try {
    const plateformes = await Plateforme.findAll({
      include: [
        { model: CLR, as: "clrs", where: { actif: true }, required: false },
      ],
    });

    const summary = plateformes.map((p) => ({
      id: p.id,
      nom: p.nom,
      region: p.region,
      ville: p.ville,
      capacite: p.capacite,
      nbClrs: p.clrs?.length || 0,
      clrs: p.clrs?.map((c) => ({
        code: c.code,
        nom: c.nom,
        wilaya: c.wilaya,
      })),
    }));

    res.json({
      plateformes: summary,
      totaux: {
        nbPlateformes: plateformes.length,
        capaciteTotale: plateformes.reduce((s, p) => s + p.capacite, 0),
        nbClrs: plateformes.reduce((s, p) => s + (p.clrs?.length || 0), 0),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});
// ── PUT /api/infrastructure/plateformes/:id ───────────────────
router.put(
  "/plateformes/:id",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    try {
      const { nom, ville, region, capacite } = req.body;
      const p = await Plateforme.findByPk(req.params.id);
      if (!p)
        return res.status(404).json({ message: "Plateforme introuvable" });
      await p.update({ nom, ville, region, capacite });
      res.json(p);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ── POST /api/infrastructure/plateformes ─────────────────────
router.post(
  "/plateformes",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    try {
      const { nom, ville, region, capacite } = req.body;
      const p = await Plateforme.create({
        nom,
        ville,
        region,
        capacite,
        actif: true,
      });
      res.status(201).json(p);
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);

// ── PUT /api/infrastructure/clrs/:id ─────────────────────────
router.put("/clrs/:id", authenticate, authorize("admin"), async (req, res) => {
  try {
    const { code, nom, wilaya, region, plateformeId, adresse } = req.body;
    const c = await CLR.findByPk(req.params.id);
    if (!c) return res.status(404).json({ message: "CLR introuvable" });
    await c.update({ code, nom, wilaya, region, plateformeId, adresse });
    res.json(c);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ── POST /api/infrastructure/clrs ────────────────────────────
router.post("/clrs", authenticate, authorize("admin"), async (req, res) => {
  try {
    const { code, nom, wilaya, region, plateformeId, adresse } = req.body;
    const c = await CLR.create({
      code,
      nom,
      wilaya,
      region,
      plateformeId,
      adresse,
      actif: true,
    });
    res.status(201).json(c);
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ── DELETE (soft) /api/infrastructure/clrs/:id ───────────────
router.delete(
  "/clrs/:id",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    try {
      const c = await CLR.findByPk(req.params.id);
      if (!c) return res.status(404).json({ message: "CLR introuvable" });
      await c.update({ actif: false });
      res.json({ message: "CLR désactivé" });
    } catch (err) {
      res.status(500).json({ message: "Erreur serveur" });
    }
  },
);
module.exports = router;
