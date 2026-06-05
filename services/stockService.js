// services/stockService.js — REFONDU Sprint 7
//
// ╔══════════════════════════════════════════════════════════════╗
// ║  RÈGLE CRITIQUE — INCHANGÉE                                 ║
// ║  Ce fichier est le SEUL autorisé à écrire dans StockCLR    ║
// ║  et MouvementStock.                                         ║
// ║  Appelé uniquement depuis routes/transport.js               ║
// ╚══════════════════════════════════════════════════════════════╝

const {
  StockCLR,
  MouvementStock,
  SeuilAlerte,
  Produit,
  OrdreTransport,
  LignePlanif,
  Order,
  OrderItem,
  AuditLog,
  CLR, // ✅ AJOUT CRITIQUE
} = require("../models");
const sequelize = require("../config/database");
const { Op } = require("sequelize");

// ─────────────────────────────────────────────────────────────
// HELPER : résoudre produitId depuis productName (OrderItem)
// Cherche par nom exact, SKU, aliases PostgreSQL, puis ILIKE
// ─────────────────────────────────────────────────────────────
async function _resoudreProduit(productName, companyId, transaction) {
  if (!productName) return null;

  // 1. Nom exact
  let produit = await Produit.findOne({
    where: { nom: productName, companyId, actif: true },
    transaction,
  });
  if (produit) return produit;

  // 2. SKU exact (si le productName ressemble à un SKU)
  if (productName.includes("-")) {
    produit = await Produit.findOne({
      where: { sku: productName, companyId, actif: true },
      transaction,
    });
    if (produit) return produit;
  }

  // 3. Aliases PostgreSQL array — cherche productName dans le tableau aliases
  const { QueryTypes } = require("sequelize");
  const rows = await sequelize.query(
    `SELECT id FROM produits 
     WHERE "companyId" = :companyId 
       AND actif = true 
       AND aliases @> ARRAY[:productName]::TEXT[]
     LIMIT 1`,
    {
      replacements: { companyId, productName },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  if (rows.length > 0) {
    produit = await Produit.findOne({
      where: { id: rows[0].id },
      transaction,
    });
    if (produit) {
      console.log(
        `[stockService] Alias match: "${productName}" → ${produit.sku}`,
      );
      return produit;
    }
  }

  // 4. Fallback ILIKE sur le nom
  produit = await Produit.findOne({
    where: {
      nom: { [Op.iLike]: `%${productName}%` },
      companyId,
      actif: true,
    },
    transaction,
  });
  if (produit) return produit;

  console.warn(`[stockService] Aucun produit trouvé pour: "${productName}"`);
  return null;
}

// ─────────────────────────────────────────────────────────────
// HELPER : écrire un mouvement + mettre à jour StockCLR
// ─────────────────────────────────────────────────────────────
async function _appliquerMouvement({
  produitId,
  clrId,
  companyId,
  type,
  quantite,
  referenceType,
  referenceId,
  userId,
  notes,
  transaction,
}) {
  // Trouver ou créer le record StockCLR
  const [stockRecord] = await StockCLR.findOrCreate({
    where: { produitId, clrId, companyId },
    defaults: { produitId, clrId, companyId, qteDisponible: 0, qteReservee: 0 },
    transaction,
  });

  const ancienneQte = stockRecord.qteDisponible;
  let nouvelleQte = ancienneQte;
  let newReservee = stockRecord.qteReservee;

  // Logique selon le type de mouvement
  switch (type) {
    case "ENTREE_LIVRAISON":
      nouvelleQte += quantite;
      newReservee = Math.max(0, newReservee - quantite); // libère la réservation
      break;
    case "SORTIE_PLANIF":
      newReservee += Math.abs(quantite); // réservation, pas encore sorti
      break;
    case "LIBERATION_RESA":
      newReservee = Math.max(0, newReservee - Math.abs(quantite));
      break;
    case "AJUSTEMENT_MANUEL":
    case "RETOUR":
    case "PERTE":
      nouvelleQte += quantite; // peut être négatif
      break;
  }

  await stockRecord.update(
    {
      qteDisponible: Math.max(0, nouvelleQte),
      qteReservee: Math.max(0, newReservee),
      lastUpdated: new Date(),
    },
    { transaction },
  );

  // Journal immuable
  await MouvementStock.create(
    {
      produitId,
      clrId,
      companyId,
      type,
      quantite,
      stockApres: Math.max(0, nouvelleQte),
      referenceType,
      referenceId,
      userId,
      notes,
    },
    { transaction },
  );

  return {
    produitId,
    clrId,
    ancienneQte,
    nouvelleQte: Math.max(0, nouvelleQte),
    mouvement: quantite,
  };
}

// ─────────────────────────────────────────────────────────────
// 1. CONFIRMER LIVRAISON (appelé par PATCH /transport/ordres/:id/confirmer)
// ─────────────────────────────────────────────────────────────
async function confirmerLivraison(ordreId, userId, companyId) {
  const transaction = await sequelize.transaction();

  try {
    const ordre = await OrdreTransport.findOne({
      where: { id: ordreId, companyId },
      transaction,
    });

    if (!ordre) throw new Error("Ordre de transport introuvable");
    if (ordre.statut === "LIVRE")
      throw new Error("Cet ordre est déjà confirmé livré");
    if (ordre.statut === "INCIDENT")
      throw new Error("Impossible de confirmer un ordre en incident");

    const lignesIds = ordre.lignesPlanifIds || [];
    if (lignesIds.length === 0)
      throw new Error("Aucune ligne de planification associée");

    // ── Modification 1 : include OrderItem → produit pour avoir produitId ──
    const lignes = await LignePlanif.findAll({
      where: { id: lignesIds },
      include: [
        {
          model: Order,
          as: "order",
          include: [
            {
              model: OrderItem,
              as: "OrderItems",
              include: [
                {
                  model: Produit,
                  as: "produit",
                  attributes: ["id", "sku", "nom"],
                  required: false,
                },
              ],
            },
          ],
        },
      ],
      transaction,
    });

    // ── Modification 2 : agréger par produitId, couvre libres ET normaux ──
    // { produitId: { qty, productName, sku } }
    const mouvements = {};

    for (const ligne of lignes) {
      const itemsJson = Array.isArray(ligne.itemsJson) ? ligne.itemsJson : [];

      if (itemsJson.length > 0) {
        // ── Cas planifié avec sélection : utiliser itemsJson ──
        for (const ij of itemsJson) {
          if (ij.libre) {
            // Produit libre : produitId directement dans itemsJson
            const pid = ij.produitId;
            if (!pid) {
              console.warn(
                `[confirmerLivraison] item libre sans produitId — ignoré`,
                ij,
              );
              continue;
            }
            if (!mouvements[pid])
              mouvements[pid] = { qty: 0, productName: ij.nom, sku: ij.sku };
            mouvements[pid].qty += ij.quantitePlanifiee || 0;
          } else {
            // Item commande planifié : récupérer produitId via OrderItem
            const orderItem = (ligne.order?.OrderItems || []).find(
              (i) => i.id === ij.orderItemId,
            );
            const pid = orderItem?.produitId ?? orderItem?.produit?.id;
            if (!pid) {
              // Fallback par nom si produitId absent
              const produit = await _resoudreProduit(
                orderItem?.productName,
                companyId,
                transaction,
              );
              if (produit) {
                if (!mouvements[produit.id])
                  mouvements[produit.id] = {
                    qty: 0,
                    productName: orderItem?.productName,
                    sku: produit.sku,
                  };
                mouvements[produit.id].qty += ij.quantitePlanifiee || 0;
              }
              continue;
            }
            if (!mouvements[pid])
              mouvements[pid] = {
                qty: 0,
                productName: orderItem?.productName,
                sku: orderItem?.produit?.sku,
              };
            mouvements[pid].qty += ij.quantitePlanifiee || 0;
          }
        }
      } else {
        // ── Cas sans itemsJson : fallback sur tous les OrderItems ──
        for (const item of ligne.order?.OrderItems || []) {
          const pid = item.produitId ?? item.produit?.id;
          if (pid) {
            if (!mouvements[pid])
              mouvements[pid] = {
                qty: 0,
                productName: item.productName,
                sku: item.produit?.sku,
              };
            mouvements[pid].qty += item.quantity || 0;
          } else {
            // Dernier fallback par nom
            const produit = await _resoudreProduit(
              item.productName,
              companyId,
              transaction,
            );
            if (produit) {
              if (!mouvements[produit.id])
                mouvements[produit.id] = {
                  qty: 0,
                  productName: item.productName,
                  sku: produit.sku,
                };
              mouvements[produit.id].qty += item.quantity || 0;
            }
          }
        }
      }
    }

    console.log(
      `[confirmerLivraison] ${Object.keys(mouvements).length} produits à traiter:`,
      Object.entries(mouvements).map(
        ([pid, { qty, sku }]) => `${sku ?? pid} × ${qty}`,
      ),
    );

    const details = [];

    // ── Modification 3 : produitId déjà résolu, pas besoin de _resoudreProduit ──
    for (const [produitId, { qty, productName, sku }] of Object.entries(
      mouvements,
    )) {
      const result = await _appliquerMouvement({
        produitId: parseInt(produitId),
        clrId: ordre.clrId,
        companyId,
        type: "ENTREE_LIVRAISON",
        quantite: qty,
        referenceType: "ORDRE_TRANSPORT",
        referenceId: ordre.id,
        userId,
        notes: `Livraison ordre #${ordre.id}`,
        transaction,
      });
      details.push({
        ...result,
        productName,
        sku,
        catalogué: true,
      });
    }

    // Passer l'ordre en LIVRE
    await ordre.update(
      { statut: "LIVRE", dateLivraisonReelle: new Date() },
      { transaction },
    );

    // Passer les lignes en LIVREE
    await LignePlanif.update(
      { statut: "LIVREE" },
      { where: { id: lignesIds }, transaction },
    );

    // Passer les Orders en delivered
    const orderIds = [...new Set(lignes.map((l) => l.orderId))];
    await Order.update(
      { status: "delivered" },
      { where: { id: orderIds }, transaction },
    );

    // Audit
    await AuditLog.create(
      {
        userId,
        companyId,
        action: "TRANSPORT_LIVRE_STOCK_MIS_A_JOUR",
        details: JSON.stringify({
          ordreId,
          clrId: ordre.clrId,
          mouvements: details,
        }),
      },
      { transaction },
    );

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

// ─────────────────────────────────────────────────────────────
// 2. RÉSERVER STOCK (appelé à la création d'un OrdreTransport)
// ─────────────────────────────────────────────────────────────
async function reserverStock(ordreId, lignesIds, clrId, companyId, userId) {
  const transaction = await sequelize.transaction();
  try {
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

    const mouvements = {};
    for (const ligne of lignes) {
      for (const item of ligne.order?.OrderItems || []) {
        const k = item.productName;
        if (!mouvements[k]) mouvements[k] = { qty: 0 };
        mouvements[k].qty += item.quantity || 0;
      }
    }

    for (const [productName, { qty }] of Object.entries(mouvements)) {
      const produit = await _resoudreProduit(
        productName,
        companyId,
        transaction,
      );
      if (produit) {
        await _appliquerMouvement({
          produitId: produit.id,
          clrId,
          companyId,
          type: "SORTIE_PLANIF",
          quantite: -qty,
          referenceType: "ORDRE_TRANSPORT",
          referenceId: ordreId,
          userId,
          notes: `Réservation ordre #${ordreId}`,
          transaction,
        });
      }
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// 3. LIBÉRER RÉSERVATION (si ordre annulé)
// ─────────────────────────────────────────────────────────────
async function libererReservation(
  ordreId,
  lignesIds,
  clrId,
  companyId,
  userId,
) {
  const transaction = await sequelize.transaction();
  try {
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

    const mouvements = {};
    for (const ligne of lignes) {
      for (const item of ligne.order?.OrderItems || []) {
        const k = item.productName;
        if (!mouvements[k]) mouvements[k] = { qty: 0 };
        mouvements[k].qty += item.quantity || 0;
      }
    }

    for (const [productName, { qty }] of Object.entries(mouvements)) {
      const produit = await _resoudreProduit(
        productName,
        companyId,
        transaction,
      );
      if (produit) {
        await _appliquerMouvement({
          produitId: produit.id,
          clrId,
          companyId,
          type: "LIBERATION_RESA",
          quantite: qty,
          referenceType: "ORDRE_TRANSPORT",
          referenceId: ordreId,
          userId,
          notes: `Libération réservation ordre #${ordreId}`,
          transaction,
        });
      }
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// 4. AJUSTEMENT MANUEL (admin uniquement)
// ─────────────────────────────────────────────────────────────
async function ajusterManuellement({
  produitId,
  clrId,
  companyId,
  quantite,
  userId,
  notes,
}) {
  const transaction = await sequelize.transaction();
  try {
    const type = quantite >= 0 ? "AJUSTEMENT_MANUEL" : "PERTE";
    await _appliquerMouvement({
      produitId,
      clrId,
      companyId,
      type,
      quantite,
      referenceType: "MANUEL",
      referenceId: null,
      userId,
      notes: notes || "Ajustement manuel",
      transaction,
    });
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// 5. DÉTECTER RUPTURES (pour alertes module IA)
// ─────────────────────────────────────────────────────────────
async function detecterRuptures(companyId) {
  const seuils = await SeuilAlerte.findAll({
    where: { companyId, actif: true },
    include: [
      { model: Produit, as: "produit", where: { actif: true }, required: true },
      { model: CLR, as: "clr", required: false },
    ],
  });

  const alertes = [];

  for (const seuil of seuils) {
    const whereClr = seuil.clrId
      ? { produitId: seuil.produitId, clrId: seuil.clrId, companyId }
      : { produitId: seuil.produitId, companyId };

    const stocks = await StockCLR.findAll({
      where: whereClr,
      include: [{ model: CLR, as: "clr" }],
    });

    for (const stock of stocks) {
      const warning =
        seuil.seuilWarning || (seuil.seuilMinimum + seuil.seuilOptimal) / 2;

      if (stock.qteDisponible <= seuil.seuilMinimum) {
        alertes.push({
          niveau: "CRITIQUE",
          produit: seuil.produit,
          clr: stock.clr,
          qte: stock.qteDisponible,
          seuil: seuil.seuilMinimum,
          optimal: seuil.seuilOptimal,
          deficit: seuil.seuilOptimal - stock.qteDisponible,
          message: `Rupture imminente — ${seuil.produit.sku} au CLR ${stock.clr?.code}`,
        });
      } else if (stock.qteDisponible <= warning) {
        alertes.push({
          niveau: "WARNING",
          produit: seuil.produit,
          clr: stock.clr,
          qte: stock.qteDisponible,
          seuil: warning,
          optimal: seuil.seuilOptimal,
          deficit: seuil.seuilOptimal - stock.qteDisponible,
          message: `Stock faible — ${seuil.produit.sku} au CLR ${stock.clr?.code}`,
        });
      }
    }
  }

  alertes.sort((a, b) => (a.niveau === "CRITIQUE" ? -1 : 1));
  return alertes;
}

// ─────────────────────────────────────────────────────────────
// 6. SNAPSHOT STOCK COMPLET (pour dashboard)
// ─────────────────────────────────────────────────────────────
async function getStockGlobal(companyId, filters = {}) {
  const where = { companyId };
  if (filters.clrId) where.clrId = filters.clrId;
  if (filters.produitId) where.produitId = filters.produitId;

  return StockCLR.findAll({
    where,
    include: [
      {
        model: Produit,
        as: "produit",
        where: filters.famille
          ? { famille: filters.famille, actif: true }
          : { actif: true },
        required: true,
      },
      { model: CLR, as: "clr" },
    ],
    order: [
      ["clrId", "ASC"],
      [{ model: Produit, as: "produit" }, "famille", "ASC"],
    ],
  });
}

module.exports = {
  confirmerLivraison,
  reserverStock,
  libererReservation,
  ajusterManuellement,
  detecterRuptures,
  getStockGlobal,
};
