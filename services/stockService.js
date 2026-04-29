// services/stockService.js
//
// ╔══════════════════════════════════════════════════════════════╗
// ║  RÈGLE CRITIQUE                                             ║
// ║  Ce fichier est le SEUL autorisé à appeler Stock.update()  ║
// ║  Il est appelé UNIQUEMENT par la confirmation de livraison  ║
// ║  dans routes/transport.js                                   ║
// ╚══════════════════════════════════════════════════════════════╝

const {
  Stock,
  OrdreTransport,
  LignePlanif,
  Order,
  OrderItem,
  AuditLog,
} = require("../models");
const sequelize = require("../config/database");

/**
 * Met à jour le stock du CLR lors de la confirmation d'une livraison.
 *
 * @param {number} ordreId       - ID de l'OrdreTransport confirmé
 * @param {number} userId        - ID de l'utilisateur qui confirme
 * @param {number} companyId     - ID de la company
 * @returns {Promise<{ updated: number, details: Array }>}
 */
async function confirmerLivraison(ordreId, userId, companyId) {
  const transaction = await sequelize.transaction();

  try {
    // 1. Récupérer l'ordre avec ses lignes de planif
    const ordre = await OrdreTransport.findOne({
      where: { id: ordreId, companyId },
      transaction,
    });

    if (!ordre) throw new Error("Ordre de transport introuvable");
    if (ordre.statut === "LIVRE")
      throw new Error("Cet ordre est déjà confirmé livré");
    if (ordre.statut === "INCIDENT")
      throw new Error("Impossible de confirmer un ordre en incident");

    // 2. Récupérer toutes les lignes de planif de cet ordre
    const lignesIds = ordre.lignesPlanifIds || [];
    if (lignesIds.length === 0)
      throw new Error("Aucune ligne de planification associée");

    const lignes = await LignePlanif.findAll({
      where: { id: lignesIds },
      include: [
        {
          model: Order,
          as: "order",
          include: [{ model: OrderItem, as: "OrderItems" }],
        },
      ],
      transaction,
    });

    // 3. Agréger les quantités par produit pour ce CLR
    const mouvements = {}; // { productName: { qty, unit } }

    for (const ligne of lignes) {
      const items = ligne.order?.OrderItems || [];
      for (const item of items) {
        const key = item.productName;
        if (!mouvements[key]) {
          mouvements[key] = { qty: 0, unit: item.unit || "unité" };
        }
        mouvements[key].qty += item.quantity || 0;
      }
    }

    // 4. Mettre à jour (ou créer) le stock pour chaque produit au CLR
    const details = [];
    for (const [productName, { qty, unit }] of Object.entries(mouvements)) {
      const [stockRecord, created] = await Stock.findOrCreate({
        where: { productName, depotId: ordre.clrId, companyId },
        defaults: {
          productName,
          availableQty: 0,
          unit,
          depotId: ordre.clrId,
          companyId,
          lastUpdated: new Date(),
        },
        transaction,
      });

      const ancienneQty = stockRecord.availableQty;
      const nouvelleQty = ancienneQty + qty;

      await stockRecord.update(
        { availableQty: nouvelleQty, lastUpdated: new Date() },
        { transaction },
      );

      details.push({
        productName,
        unit,
        ancienneQty,
        ajout: qty,
        nouvelleQty,
        created,
      });
    }

    // 5. Passer l'ordre en LIVRE
    await ordre.update(
      { statut: "LIVRE", dateLivraisonReelle: new Date() },
      { transaction },
    );

    // 6. Passer les lignes de planif en LIVREE
    await LignePlanif.update(
      { statut: "LIVREE" },
      { where: { id: lignesIds }, transaction },
    );

    // 7. Passer les orders associés en delivered
    const orderIds = [...new Set(lignes.map((l) => l.orderId))];
    await Order.update(
      { status: "delivered" },
      { where: { id: orderIds }, transaction },
    );

    // 8. Audit log
    if (AuditLog) {
      await AuditLog.create(
        {
          userId,
          action: "TRANSPORT_LIVRE_STOCK_MIS_A_JOUR",
          details: JSON.stringify({
            ordreId,
            clrId: ordre.clrId,
            mouvements: details,
          }),
          companyId,
        },
        { transaction },
      );
    }

    await transaction.commit();

    return {
      updated: details.length,
      details,
      ordreId,
      clrId: ordre.clrId,
      dateLivraisonReelle: ordre.dateLivraisonReelle,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = { confirmerLivraison };
