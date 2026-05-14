// routes/demandes-commande.js
// Accès commercial / admin pour traiter les demandes en ligne
'use strict';
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { DemandeCommande, User } = require('../models');
const svc = require('../services/portailService');

router.use(authenticate, authorize('commercial', 'admin'));

/**
 * GET /demandes-commande
 * Toutes les demandes de la company (avec filtres statut)
 */
router.get('/', async (req, res) => {
  try {
    const where = { companyId: req.user.companyId };
    if (req.query.statut) where.statut = req.query.statut;

    const demandes = await DemandeCommande.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'clientUser', attributes: ['id', 'nom', 'email', 'codeClient'] },
        { model: User, as: 'traiteurUser', attributes: ['id', 'nom'], required: false },
      ],
    });
    res.json({ success: true, data: demandes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /demandes-commande/stats
 * Comptage par statut pour tableau de bord
 */
router.get('/stats', async (req, res) => {
  try {
    const { sequelize } = require('../models');
    const { QueryTypes } = require('sequelize');
    const rows = await sequelize.query(
      `SELECT statut, COUNT(*) as count
       FROM demande_commandes
       WHERE "companyId" = :companyId
       GROUP BY statut`,
      { replacements: { companyId: req.user.companyId }, type: QueryTypes.SELECT }
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /demandes-commande/:id/traiter
 * Valider ou rejeter une demande
 * Body: { action: 'VALIDEE'|'REJETEE', commentaire? }
 */
router.patch('/:id/traiter', async (req, res) => {
  try {
    const { action, commentaire } = req.body;
    const demande = await svc.traiterDemandeCommande({
      demandeId: parseInt(req.params.id),
      companyId: req.user.companyId,
      traitePar: req.user.id,
      action,
      commentaire,
    });
    res.json({ success: true, data: demande });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
