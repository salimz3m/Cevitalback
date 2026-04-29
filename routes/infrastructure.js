// routes/infrastructure.js
const express = require('express');
const router = express.Router();
const { Plateforme, CLR } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');

// ── GET /api/infrastructure/plateformes ───────────────────────
// Retourne les 3 plateformes avec leurs CLR rattachés
router.get('/plateformes', authenticate, async (req, res) => {
  try {
    const plateformes = await Plateforme.findAll({
      where: { actif: true },
      include: [{ model: CLR, as: 'clrs', where: { actif: true }, required: false }],
      order: [['region', 'ASC'], [{ model: CLR, as: 'clrs' }, 'code', 'ASC']],
    });
    res.json(plateformes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── GET /api/infrastructure/clrs ──────────────────────────────
// Retourne tous les CLR (utile pour les selects)
router.get('/clrs', authenticate, async (req, res) => {
  try {
    const clrs = await CLR.findAll({
      where: { actif: true },
      include: [{ model: Plateforme, as: 'plateforme', attributes: ['id', 'nom', 'region'] }],
      order: [['region', 'ASC'], ['code', 'ASC']],
    });
    res.json(clrs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── GET /api/infrastructure/clrs/:region ──────────────────────
// Filtre par région (EST / CENTRE / OUEST)
router.get('/clrs/:region', authenticate, async (req, res) => {
  try {
    const region = req.params.region.toUpperCase();
    if (!['EST', 'CENTRE', 'OUEST'].includes(region))
      return res.status(400).json({ message: 'Région invalide. Valeurs : EST, CENTRE, OUEST' });

    const clrs = await CLR.findAll({
      where: { actif: true, region },
      include: [{ model: Plateforme, as: 'plateforme', attributes: ['id', 'nom'] }],
      order: [['code', 'ASC']],
    });
    res.json(clrs);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── GET /api/infrastructure/summary ───────────────────────────
// Vue synthétique pour le dashboard admin
router.get('/summary', authenticate, async (req, res) => {
  try {
    const plateformes = await Plateforme.findAll({
      include: [{ model: CLR, as: 'clrs', where: { actif: true }, required: false }],
    });

    const summary = plateformes.map(p => ({
      id:        p.id,
      nom:       p.nom,
      region:    p.region,
      ville:     p.ville,
      capacite:  p.capacite,
      nbClrs:    p.clrs?.length || 0,
      clrs:      p.clrs?.map(c => ({ code: c.code, nom: c.nom, wilaya: c.wilaya })),
    }));

    res.json({
      plateformes: summary,
      totaux: {
        nbPlateformes:  plateformes.length,
        capaciteTotale: plateformes.reduce((s, p) => s + p.capacite, 0),
        nbClrs:         plateformes.reduce((s, p) => s + (p.clrs?.length || 0), 0),
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
