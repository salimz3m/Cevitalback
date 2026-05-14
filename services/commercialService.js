const { Op } = require("sequelize");
const {
  Client,
  Order,
  OrderItem,
  StockCLR,
  MouvementStock,
  Produit,
  CLR,
  Company,
} = require("../models");
const { ajusterManuellement } = require("./stockService");

// ─────────────────────────────────────────────────────────────
// Synchroniser clients depuis les commandes existantes
// Appelé automatiquement à chaque import Keep Contact
// ─────────────────────────────────────────────────────────────
async function syncClientsDepuisOrders(companyId) {
  const orders = await Order.findAll({
    where: { companyId, codeClient: { [Op.ne]: null } },
    attributes: ["codeClient", "clrCode"],
  });

  const clrs = await CLR.findAll({ attributes: ["id", "code"] });
  const clrMap = {};
  clrs.forEach((c) => {
    clrMap[c.code] = c.id;
  });

  let crees = 0;
  for (const o of orders) {
    if (!o.codeClient) continue;
    const [, created] = await Client.findOrCreate({
      where: { codeClient: o.codeClient, companyId },
      defaults: {
        codeClient: o.codeClient,
        companyId,
        clrCode: o.clrCode || null,
        clrId: o.clrCode ? clrMap[o.clrCode] || null : null,
      },
    });
    if (created) crees++;
  }
  return { crees };
}

// ─────────────────────────────────────────────────────────────
// Liste clients avec historique résumé
// ─────────────────────────────────────────────────────────────
async function getClients(companyId, { clrId } = {}) {
  const where = { companyId, actif: true };
  if (clrId) where.clrId = parseInt(clrId);

  const clients = await Client.findAll({
    where,
    include: [
      { model: CLR, as: "clr", attributes: ["id", "code", "nom", "wilaya"] },
    ],
    order: [["codeClient", "ASC"]],
  });

  // Enrichir avec nb commandes + dernière commande
  const enriched = await Promise.all(
    clients.map(async (c) => {
      const orders = await Order.findAll({
        where: { companyId, codeClient: c.codeClient },
        attributes: ["id", "orderNumber", "date", "status"],
        order: [["date", "DESC"]],
        limit: 1,
      });
      const nbCommandes = await Order.count({
        where: { companyId, codeClient: c.codeClient },
      });
      return {
        ...c.toJSON(),
        nbCommandes,
        derniereCommande: orders[0] || null,
      };
    }),
  );

  return enriched;
}

// ─────────────────────────────────────────────────────────────
// Historique commandes d'un client
// ─────────────────────────────────────────────────────────────
async function getHistoriqueClient(codeClient, companyId) {
  const client = await Client.findOne({
    where: { codeClient, companyId },
    include: [{ model: CLR, as: "clr", attributes: ["id", "code", "nom"] }],
  });

  const orders = await Order.findAll({
    where: { companyId, codeClient },
    include: [
      {
        model: OrderItem,
        as: "OrderItems",
        include: [
          {
            model: Produit,
            as: "produit",
            attributes: ["id", "sku", "nom", "famille", "prixUnitaireDZD"],
            required: false,
          },
        ],
      },
    ],
    order: [["date", "DESC"]],
  });

  // CA estimé par commande
  const ordersEnrichis = orders.map((o) => {
    const caEstime = (o.OrderItems || []).reduce((sum, item) => {
      const prix = item.produit?.prixUnitaireDZD || item.unitPrice || 0;
      return sum + (item.quantity || 0) * prix;
    }, 0);
    const nbUnites = (o.OrderItems || []).reduce(
      (s, i) => s + (i.quantity || 0),
      0,
    );
    return { ...o.toJSON(), caEstime: Math.round(caEstime), nbUnites };
  });

  const caTotal = ordersEnrichis.reduce((s, o) => s + o.caEstime, 0);
  const nbLivrees = ordersEnrichis.filter(
    (o) => o.status === "delivered",
  ).length;

  return {
    client: client || { codeClient, companyId },
    orders: ordersEnrichis,
    resume: {
      nbCommandes: ordersEnrichis.length,
      nbLivrees,
      tauxService:
        ordersEnrichis.length > 0
          ? Math.round((nbLivrees / ordersEnrichis.length) * 100)
          : 0,
      caTotal: Math.round(caTotal),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Confirmer livraison client → SORTIE_VENTE sur StockCLR
// ─────────────────────────────────────────────────────────────
async function confirmerLivraison({
  orderId,
  clrId,
  userId,
  companyId,
  notes,
}) {
  const order = await Order.findOne({
    where: { id: orderId, companyId },
    include: [
      {
        model: OrderItem,
        as: "OrderItems",
        include: [{ model: Produit, as: "produit", required: false }],
      },
    ],
  });
  if (!order) throw new Error("Commande introuvable");
  if (order.status === "delivered") throw new Error("Commande déjà livrée");

  const mouvements = [];

  for (const item of order.OrderItems || []) {
    if (!item.produitId) continue;

    // Déduire du stock CLR
    const stock = await StockCLR.findOne({
      where: { produitId: item.produitId, clrId, companyId },
    });

    const qteAvant = stock?.qteDisponible || 0;
    const qteDeduire = Math.min(item.quantity || 0, qteAvant);

    if (stock && qteDeduire > 0) {
      await stock.update({
        qteDisponible: qteAvant - qteDeduire,
        lastUpdated: new Date(),
      });
    }

    // Mouvement SORTIE_VENTE
    const mouvement = await MouvementStock.create({
      produitId: item.produitId,
      clrId,
      companyId,
      type: "SORTIE_VENTE",
      quantite: -(item.quantity || 0),
      stockApres: Math.max(0, qteAvant - qteDeduire),
      referenceType: "MANUEL",
      referenceId: order.id,
      userId,
      notes:
        notes ||
        `Livraison client ${order.codeClient || ""} — ${order.orderNumber}`,
    });
    mouvements.push(mouvement);
  }

  // Marquer commande livrée
  await order.update({ status: "delivered" });

  return {
    order: { id: order.id, orderNumber: order.orderNumber },
    nbMouvements: mouvements.length,
    message: "Livraison confirmée — stock déduit",
  };
}

// ─────────────────────────────────────────────────────────────
// KPI commercial par CLR
// ─────────────────────────────────────────────────────────────
async function getKPICommercial(companyId) {
  const clrs = await CLR.findAll({ where: { actif: true } });

  const kpiParCLR = await Promise.all(
    clrs.map(async (clr) => {
      const ordersClr = await Order.findAll({
        where: { companyId, clrCode: clr.code },
        include: [
          {
            model: OrderItem,
            as: "OrderItems",
            include: [
              {
                model: Produit,
                as: "produit",
                attributes: ["prixUnitaireDZD"],
                required: false,
              },
            ],
          },
        ],
      });

      const livrees = ordersClr.filter((o) => o.status === "delivered");
      const caTotal = livrees.reduce((sum, o) => {
        return (
          sum +
          (o.OrderItems || []).reduce((s, i) => {
            return (
              s +
              (i.quantity || 0) *
                (i.produit?.prixUnitaireDZD || i.unitPrice || 0)
            );
          }, 0)
        );
      }, 0);

      const nbClients = await Client.count({
        where: { companyId, clrId: clr.id, actif: true },
      });

      return {
        clr: { id: clr.id, code: clr.code, nom: clr.nom, wilaya: clr.wilaya },
        nbCommandes: ordersClr.length,
        nbLivrees: livrees.length,
        tauxService:
          ordersClr.length > 0
            ? Math.round((livrees.length / ordersClr.length) * 100)
            : 0,
        caEstimeDZD: Math.round(caTotal),
        nbClients,
      };
    }),
  );

  const totaux = {
    caTotal: kpiParCLR.reduce((s, k) => s + k.caEstimeDZD, 0),
    nbCommandesTotal: kpiParCLR.reduce((s, k) => s + k.nbCommandes, 0),
    nbLivreesTotal: kpiParCLR.reduce((s, k) => s + k.nbLivrees, 0),
    tauxServiceGlobal: 0,
  };
  if (totaux.nbCommandesTotal > 0) {
    totaux.tauxServiceGlobal = Math.round(
      (totaux.nbLivreesTotal / totaux.nbCommandesTotal) * 100,
    );
  }

  return { kpiParCLR, totaux };
}

module.exports = {
  syncClientsDepuisOrders,
  getClients,
  getHistoriqueClient,
  confirmerLivraison,
  getKPICommercial,
};
