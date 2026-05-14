// services/modules/planningAnalyzer.js — Sprint 8 refonte
// Branché sur StockCLR (Sprint 7) au lieu de l'ancien Stock

const {
  StockCLR,
  Produit,
  CLR,
  Plateforme,
  LignePlanif,
  PlanifSession,
  Order,
  OrderItem,
} = require("../../models");
const { Op } = require("sequelize");

// ─────────────────────────────────────────────────────────────
// HELPER : stock total disponible pour un CLR donné
// Somme qteDisponible sur tous les produits du CLR
// ─────────────────────────────────────────────────────────────
async function _getStockTotalCLR(clrId, companyId) {
  const stocks = await StockCLR.findAll({
    where: { clrId, companyId },
  });
  return stocks.reduce((sum, s) => sum + (s.qteDisponible || 0), 0);
}

// ─────────────────────────────────────────────────────────────
// HELPER : stock détaillé par produit pour un CLR
// ─────────────────────────────────────────────────────────────
async function _getStockDetailCLR(clrId, companyId) {
  return StockCLR.findAll({
    where: { clrId, companyId },
    include: [
      {
        model: Produit,
        as: "produit",
        where: { actif: true },
        attributes: ["id", "sku", "nom", "famille"],
        required: true,
      },
    ],
  });
}

async function getDashboardCLR(companyId) {
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

  // Commandes planifiées non livrées
  const lignesActives = await LignePlanif.findAll({
    where: { statut: { [Op.in]: ["PLANIFIEE", "ENVOYEE_TRANSPORT"] } },
    include: [
      {
        model: PlanifSession,
        as: "session",
        where: { companyId },
        attributes: [],
        required: true,
      },
      {
        model: Order,
        as: "order",
        include: [{ model: OrderItem, as: "OrderItems" }],
      },
    ],
  });

  // Agréger commandes par CLR
  const commandesParClr = {};
  lignesActives.forEach((ligne) => {
    const key = ligne.clrId;
    if (!commandesParClr[key]) commandesParClr[key] = 0;
    (ligne.order?.OrderItems || []).forEach((item) => {
      commandesParClr[key] += item.quantity || 0;
    });
  });

  // Construire dashboard — stock réel depuis StockCLR
  const dashboard = await Promise.all(
    clrs.map(async (clr) => {
      const stockActuel = await _getStockTotalCLR(clr.id, companyId);
      const commandesDues = commandesParClr[clr.id] || 0;
      const ecart = stockActuel - commandesDues;
      const ratio = commandesDues === 0 ? 1 : stockActuel / commandesDues;

      let niveau, couleur, message;
      if (commandesDues === 0 && stockActuel === 0) {
        niveau = "NEUTRE";
        couleur = "grey";
        message = "Aucune activité";
      } else if (ecart < 0) {
        niveau = "ROUGE";
        couleur = "red";
        message = `Rupture : manque ${Math.abs(ecart).toFixed(0)} unités`;
      } else if (ratio < 1.2) {
        niveau = "ORANGE";
        couleur = "orange";
        message = `Stock faible : ${ecart.toFixed(0)} unités de marge`;
      } else {
        niveau = "VERT";
        couleur = "green";
        message = `Stock suffisant : ${ecart.toFixed(0)} unités disponibles`;
      }

      return {
        clr: {
          id: clr.id,
          code: clr.code,
          nom: clr.nom,
          wilaya: clr.wilaya,
          region: clr.region,
          plateforme: clr.plateforme,
        },
        stockActuel,
        commandesDues,
        ecart,
        ratio: Math.round(ratio * 100) / 100,
        niveau,
        couleur,
        message,
      };
    }),
  );

  const resume = {
    totalVert: dashboard.filter((d) => d.niveau === "VERT").length,
    totalOrange: dashboard.filter((d) => d.niveau === "ORANGE").length,
    totalRouge: dashboard.filter((d) => d.niveau === "ROUGE").length,
    totalNeutre: dashboard.filter((d) => d.niveau === "NEUTRE").length,
    clrsEnRupture: dashboard
      .filter((d) => d.niveau === "ROUGE")
      .map((d) => d.clr.code),
  };

  return { dashboard, resume };
}

// ─────────────────────────────────────────────────────────────
// Suggestion diapason D1 vs D2
// ─────────────────────────────────────────────────────────────
// Remplacer toute la fonction getSuggestionDiapason par :
async function getSuggestionDiapason(clrId, companyId, orderId = null) {
  const clr = await CLR.findByPk(clrId, {
    include: [{ model: Plateforme, as: "plateforme" }],
  });
  if (!clr) throw new Error("CLR introuvable");

  // Stock détaillé par produit au CLR
  const stocksDetail = await _getStockDetailCLR(clrId, companyId);
  const stockActuelCLR = stocksDetail.reduce(
    (sum, s) => sum + (s.qteDisponible || 0),
    0,
  );

  // ── NOUVEAU : croisement avec les produits de la commande ──
  let stockParProduit = [];
  if (orderId) {
    const order = await Order.findOne({
      where: { id: orderId, companyId },
      include: [
        {
          model: OrderItem,
          as: "OrderItems",
          include: [
            {
              model: Produit,
              as: "produit",
              attributes: ["id", "sku", "nom", "famille"],
              required: false,
            },
          ],
        },
      ],
    });

    if (order) {
      stockParProduit = (order.OrderItems || []).map((item) => {
        // Chercher le stock de ce produit au CLR
        const stockProduit = stocksDetail.find(
          (s) => s.produitId === item.produitId,
        );
        const dispo = stockProduit?.qteDisponible || 0;
        const demande = item.quantity || 0;
        const couverture =
          demande === 0 ? 100 : Math.round((dispo / demande) * 100);

        let feu;
        if (couverture >= 100) feu = "VERT";
        else if (couverture >= 50) feu = "ORANGE";
        else feu = "ROUGE";

        return {
          produitId: item.produitId,
          sku: item.produit?.sku || item.sku || "—",
          nom: item.produit?.nom || item.productName || "—",
          famille: item.produit?.famille || "—",
          demande,
          dispo,
          couverture,
          feu,
          manque: Math.max(0, demande - dispo),
        };
      });
    }
  }

  // Stock à la plateforme de rattachement
  let stockPlateforme = 0;
  let capacitePlateforme = 0;
  if (clr.plateformeId) {
    stockPlateforme = await _getStockTotalCLR(clr.plateformeId, companyId);
    capacitePlateforme = clr.plateforme?.capacite || 0;
  }

  const lignesActives = await LignePlanif.findAll({
    where: { clrId, statut: { [Op.in]: ["PLANIFIEE", "ENVOYEE_TRANSPORT"] } },
    include: [
      {
        model: PlanifSession,
        as: "session",
        where: { companyId },
        attributes: [],
        required: true,
      },
    ],
  });
  const nbLignesActives = lignesActives.length;

  // Logique suggestion — inchangée
  let suggestion, raison, score;
  if (stockPlateforme > stockActuelCLR * 2 && capacitePlateforme > 0) {
    suggestion = "D1";
    raison = `La plateforme ${clr.plateforme?.nom} dispose de stock suffisant pour transiter`;
    score = 85;
  } else if (nbLignesActives > 3) {
    suggestion = "D2";
    raison =
      "Volume de livraisons élevé — livraison directe au CLR plus efficace";
    score = 78;
  } else if (stockActuelCLR < 50) {
    suggestion = "D2";
    raison =
      "Stock CLR critique — approvisionnement direct recommandé (D2 plus rapide)";
    score = 90;
  } else {
    suggestion = "D1";
    raison = "Flux standard — passage par la plateforme régionale recommandé";
    score = 65;
  }

  // Résumé couverture si orderId fourni
  const resumeCouverture = orderId
    ? {
        totalLignes: stockParProduit.length,
        couverts: stockParProduit.filter((p) => p.feu === "VERT").length,
        partiels: stockParProduit.filter((p) => p.feu === "ORANGE").length,
        impossibles: stockParProduit.filter((p) => p.feu === "ROUGE").length,
      }
    : null;

  return {
    clr: { id: clr.id, code: clr.code, nom: clr.nom, region: clr.region },
    plateforme: clr.plateforme
      ? { id: clr.plateforme.id, nom: clr.plateforme.nom }
      : null,
    stockActuelCLR,
    stockPlateforme,
    nbLignesActives,
    suggestion,
    raison,
    score,
    // ── NOUVEAU ──
    stockParProduit, // [] si pas d'orderId
    resumeCouverture, // null si pas d'orderId
    alternatives: {
      D1: {
        disponible: !!clr.plateforme,
        description: `Via ${clr.plateforme?.nom || "N/A"} → ${clr.nom}`,
      },
      D2: { disponible: true, description: `Direct → ${clr.nom}` },
      D3: { disponible: true, description: `Transfert CLR → ${clr.nom}` },
      D4: {
        disponible: !!clr.plateforme,
        description: `Réappro Usine → ${clr.plateforme?.nom || "N/A"}`,
      },
      D5: {
        disponible: !!clr.plateforme,
        description: `Retour ${clr.nom} → Plateforme`,
      },
    },
  };
}
// ─────────────────────────────────────────────────────────────
// Alertes rupture anticipée
// ─────────────────────────────────────────────────────────────
async function getAlertesRupture(companyId) {
  const { dashboard } = await getDashboardCLR(companyId);

  const alertes = dashboard
    .filter((d) => d.niveau === "ROUGE" || d.niveau === "ORANGE")
    .map((d) => ({
      clr: d.clr,
      niveau: d.niveau,
      stockActuel: d.stockActuel,
      commandesDues: d.commandesDues,
      ecart: d.ecart,
      message: d.message,
      urgence: d.niveau === "ROUGE" ? "CRITIQUE" : "ATTENTION",
      action:
        d.niveau === "ROUGE"
          ? "Planifier un réapprovisionnement immédiat"
          : "Surveiller et prévoir un réapprovisionnement",
    }))
    .sort((a, b) => a.ecart - b.ecart);

  return {
    nbAlertes: alertes.length,
    alertes,
    dateAnalyse: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// Simulation de flux
// ─────────────────────────────────────────────────────────────
async function simulerFlux(clrId, quantite, diapason, companyId) {
  const clr = await CLR.findByPk(clrId, {
    include: [{ model: Plateforme, as: "plateforme" }],
  });
  if (!clr) throw new Error("CLR introuvable");

  const stockActuelCLR = await _getStockTotalCLR(clrId, companyId);
  let stockPlat = 0;
  if (clr.plateformeId) {
    stockPlat = await _getStockTotalCLR(clr.plateformeId, companyId);
  }

  const simulation = {
    avant: { stockCLR: stockActuelCLR, stockPlateforme: stockPlat },
    apres: {
      stockCLR: stockActuelCLR + quantite,
      stockPlateforme:
        diapason === "D1" ? Math.max(0, stockPlat - quantite) : stockPlat,
    },
    impact: {
      gainCLR: quantite,
      pertePlateforme: diapason === "D1" ? quantite : 0,
      diapasonUtilise: diapason,
      clr: { code: clr.code, nom: clr.nom },
      plateforme: clr.plateforme?.nom || "N/A",
    },
    faisable: diapason === "D2" || stockPlat >= quantite,
    alertes: [],
  };

  if (diapason === "D1" && stockPlat < quantite) {
    simulation.alertes.push(
      `Stock insuffisant à la plateforme ${clr.plateforme?.nom} (disponible: ${stockPlat}, requis: ${quantite})`,
    );
  }
  if (simulation.apres.stockCLR > 1000) {
    simulation.alertes.push(
      `Attention : stock CLR post-livraison élevé (${simulation.apres.stockCLR} unités)`,
    );
  }

  return simulation;
}

// ─────────────────────────────────────────────────────────────
// Optimisation chargement — avec détail produits
// ─────────────────────────────────────────────────────────────
async function getOptimisationChargement(sessionId, companyId) {
  const session = await PlanifSession.findOne({
    where: { id: sessionId, companyId },
    include: [
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
                as: "OrderItems",
                attributes: [
                  "productName",
                  "quantity",
                  "unit",
                  "produitId",
                  "sku",
                ],
                include: [
                  {
                    model: Produit,
                    as: "produit",
                    attributes: ["id", "sku", "nom", "famille"],
                    required: false,
                  },
                ],
              },
            ],
          },
          {
            model: CLR,
            as: "clr",
            attributes: ["id", "code", "nom", "region"],
          },
        ],
      },
    ],
  });

  if (!session) throw new Error("Session introuvable");

  const CAPACITE_CAMION = 200;
  const groupesParClr = {};

  (session.lignes || []).forEach((ligne) => {
    const key = ligne.clrId;
    if (!groupesParClr[key]) {
      groupesParClr[key] = {
        clr: ligne.clr,
        lignes: [],
        quantiteTotale: 0,
        produitsDetail: {},
      };
    }

    const items = ligne.order?.OrderItems || [];
    const qte = items.reduce((s, i) => s + (i.quantity || 0), 0);

    // Détail par produit
    // Dans getOptimisationChargement, remplacer uniquement le bloc "Détail par produit" :

    items.forEach((item) => {
      // ← utiliser sku réel si disponible, sinon fallback productName
      const k = item.produit?.sku || item.productName;
      const label = item.produit?.nom || item.productName;
      if (!groupesParClr[key].produitsDetail[k]) {
        groupesParClr[key].produitsDetail[k] = {
          label,
          sku: item.produit?.sku || null,
          quantite: 0,
          unit: item.unit,
        };
      }
      groupesParClr[key].produitsDetail[k].quantite += item.quantity || 0;
    });
    groupesParClr[key].lignes.push({
      ligneId: ligne.id,
      orderId: ligne.orderId,
      quantite: qte,
    });
    groupesParClr[key].quantiteTotale += qte;
  });

  const suggestions = Object.values(groupesParClr).map((g) => ({
    clr: g.clr,
    nbLignes: g.lignes.length,
    quantiteTotale: g.quantiteTotale,
    produitsDetail: Object.entries(g.produitsDetail).map(([nom, d]) => ({
      nom,
      quantite: d.quantite,
      unit: d.unit,
    })),
    nbCamionsNeeded: Math.ceil(g.quantiteTotale / CAPACITE_CAMION),
    tauxRemplissage:
      Math.min(
        100,
        Math.round(
          ((g.quantiteTotale % CAPACITE_CAMION) / CAPACITE_CAMION) * 100,
        ),
      ) || 100,
    recommandation:
      g.quantiteTotale <= CAPACITE_CAMION
        ? "Un seul camion suffit"
        : `Prévoir ${Math.ceil(g.quantiteTotale / CAPACITE_CAMION)} camions`,
  }));

  return {
    sessionId,
    nbGroupes: groupesParClr ? Object.keys(groupesParClr).length : 0,
    suggestions,
    capaciteCamion: CAPACITE_CAMION,
  };
}

module.exports = {
  getDashboardCLR,
  getSuggestionDiapason,
  getAlertesRupture,
  simulerFlux,
  getOptimisationChargement,
};
