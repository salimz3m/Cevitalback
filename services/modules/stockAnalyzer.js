/**
 * stockAnalyzer.js — Sprint 7
 * Analyse heuristique : ruptures, rotations, prévisions stock
 * ⚠️ Ce service ne fait que lire — seul stockService.js écrit dans StockCLR
 */

const {
  StockCLR,
  Produit,
  SeuilAlerte,
  MouvementStock,
  CLR,
  LignePlanif,
} = require("../../models");
const { Op, Sequelize } = require("sequelize");

// ─────────────────────────────────────────────
// ANALYSE RUPTURES
// ─────────────────────────────────────────────

/**
 * Détecte tous les produits sous leur seuil minimum par CLR
 * @param {number} companyId
 * @returns {Array} alertes avec niveau de criticité
 */
async function analyserRuptures(companyId) {
  // Récupérer tous les seuils actifs
  const seuils = await SeuilAlerte.findAll({
    where: { actif: true, companyId },
    include: [{ model: Produit, as: "produit", where: { actif: true } }],
  });

  const alertes = [];

  for (const seuil of seuils) {
    const whereStock = {
      produitId: seuil.produitId,
      companyId,
    };
    if (seuil.clrId) whereStock.clrId = seuil.clrId;

    const stocks = await StockCLR.findAll({
      where: whereStock,
      include: [{ model: CLR, as: "clr" }],
    });

    for (const stock of stocks) {
      const niveauPct =
        seuil.seuilOptimal > 0
          ? (stock.qteDisponible / seuil.seuilOptimal) * 100
          : 100;

      if (stock.qteDisponible <= seuil.seuilMinimum) {
        alertes.push({
          niveau: stock.qteDisponible === 0 ? "RUPTURE" : "CRITIQUE",
          produitId: seuil.produitId,
          sku: seuil.produit.sku,
          nomProduit: seuil.produit.nom,
          famille: seuil.produit.famille,
          clrId: stock.clrId,
          nomCLR: stock.clr?.nom || "N/A",
          regionCLR: stock.clr?.region || "N/A",
          qteDisponible: stock.qteDisponible,
          qteReservee: stock.qteReservee,
          seuilMinimum: seuil.seuilMinimum,
          seuilOptimal: seuil.seuilOptimal,
          niveauPct: Math.round(niveauPct),
          manquant: Math.max(0, seuil.seuilMinimum - stock.qteDisponible),
        });
      } else if (stock.qteDisponible <= seuil.seuilOptimal * 0.5) {
        alertes.push({
          niveau: "ATTENTION",
          produitId: seuil.produitId,
          sku: seuil.produit.sku,
          nomProduit: seuil.produit.nom,
          famille: seuil.produit.famille,
          clrId: stock.clrId,
          nomCLR: stock.clr?.nom || "N/A",
          regionCLR: stock.clr?.region || "N/A",
          qteDisponible: stock.qteDisponible,
          qteReservee: stock.qteReservee,
          seuilMinimum: seuil.seuilMinimum,
          seuilOptimal: seuil.seuilOptimal,
          niveauPct: Math.round(niveauPct),
          manquant: 0,
        });
      }
    }
  }

  // Trier par criticité : RUPTURE > CRITIQUE > ATTENTION
  const ordre = { RUPTURE: 0, CRITIQUE: 1, ATTENTION: 2 };
  alertes.sort((a, b) => ordre[a.niveau] - ordre[b.niveau]);

  return {
    total: alertes.length,
    ruptures: alertes.filter((a) => a.niveau === "RUPTURE").length,
    critiques: alertes.filter((a) => a.niveau === "CRITIQUE").length,
    attentions: alertes.filter((a) => a.niveau === "ATTENTION").length,
    alertes,
  };
}

// ─────────────────────────────────────────────
// ANALYSE ROTATIONS
// ─────────────────────────────────────────────

/**
 * Calcule la rotation de chaque produit sur les 30 derniers jours
 * @param {number} companyId
 * @returns {Array} produits triés par rotation (fort → faible)
 */
async function analyserRotations(companyId) {
  const depuis = new Date();
  depuis.setDate(depuis.getDate() - 30);

  // ✅ Requête 1 : mouvements SANS JOIN Produit pour éviter l'ambiguïté
  const mouvements = await MouvementStock.findAll({
    where: {
      companyId,
      createdAt: { [Op.gte]: depuis },
      type: { [Op.in]: ["ENTREE_LIVRAISON", "SORTIE_PLANIF"] },
    },
    attributes: [
      "produitId",
      "type",
      [
        Sequelize.fn("SUM", Sequelize.fn("ABS", Sequelize.col("quantite"))),
        "volumeTotal",
      ],
      [
        Sequelize.fn("COUNT", Sequelize.literal('"MouvementStock"."id"')),
        "nbMouvements",
      ],
    ],
    group: ["produitId", "type"],
    raw: true,
  });

  // ✅ Requête 2 : infos produits séparément
  const produitIds = [...new Set(mouvements.map((m) => m.produitId))];
  const produits = await Produit.findAll({
    where: { id: { [Op.in]: produitIds } },
    attributes: ["id", "sku", "nom", "famille", "marque"],
    raw: true,
  });
  const produitsMap = {};
  for (const p of produits) {
    produitsMap[p.id] = p;
  }

  // ✅ Requête 3 : stock actuel
  const stocks = await StockCLR.findAll({
    where: { companyId },
    attributes: [
      "produitId",
      [Sequelize.fn("SUM", Sequelize.col("qteDisponible")), "stockTotal"],
    ],
    group: ["produitId"],
    raw: true,
  });
  const stocksMap = {};
  for (const s of stocks) {
    stocksMap[s.produitId] = parseFloat(s.stockTotal) || 0;
  }

  // Construire map par produit
  const map = {};
  for (const m of mouvements) {
    if (!map[m.produitId]) {
      const prod = produitsMap[m.produitId] || {};
      map[m.produitId] = {
        produitId: m.produitId,
        sku: prod.sku || null,
        nom: prod.nom || null,
        famille: prod.famille || null,
        entrees: 0,
        sorties: 0,
        nbMouvements: 0,
        stockActuel: stocksMap[m.produitId] || 0,
      };
    }
    if (m.type === "ENTREE_LIVRAISON")
      map[m.produitId].entrees += parseFloat(m.volumeTotal) || 0;
    if (m.type === "SORTIE_PLANIF")
      map[m.produitId].sorties += parseFloat(m.volumeTotal) || 0;
    map[m.produitId].nbMouvements += parseInt(m.nbMouvements) || 0;
  }

  const rotations = Object.values(map).map((p) => {
    const volumeTotal = p.entrees + p.sorties;
    const tauxRotation =
      p.stockActuel > 0 ? (p.sorties / p.stockActuel) * 30 : 0;
    return {
      ...p,
      volumeTotal,
      tauxRotation: Math.round(tauxRotation * 10) / 10,
      categorie:
        tauxRotation > 5 ? "FORTE" : tauxRotation > 1 ? "MOYENNE" : "FAIBLE",
    };
  });

  rotations.sort((a, b) => b.tauxRotation - a.tauxRotation);

  return {
    periode: "30 jours",
    total: rotations.length,
    forteRotation: rotations.filter((r) => r.categorie === "FORTE").length,
    faibleRotation: rotations.filter((r) => r.categorie === "FAIBLE").length,
    rotations,
  };
}

// ─────────────────────────────────────────────
// PRÉVISIONS J+7
// ─────────────────────────────────────────────

/**
 * Prévisions de stock à J+7 basées sur :
 * - Consommation historique moyenne
 * - Livraisons planifiées (LignePlanif PLANIFIEE → ENVOYEE_TRANSPORT)
 * @param {number} companyId
 * @returns {Array} prévisions par produit/CLR avec risque de rupture
 */
async function calculerPrevisions(companyId) {
  const depuis = new Date();
  depuis.setDate(depuis.getDate() - 14); // 2 semaines d'historique

  // Consommation moyenne journalière par produit/CLR (14j)
  const conso = await MouvementStock.findAll({
    where: {
      companyId,
      type: "SORTIE_PLANIF",
      createdAt: { [Op.gte]: depuis },
    },
    attributes: [
      "produitId",
      "clrId",
      [
        Sequelize.fn("SUM", Sequelize.fn("ABS", Sequelize.col("quantite"))),
        "totalSorties",
      ],
    ],
    group: ["produitId", "clrId"],
    raw: true,
  });

  // Stock actuel
  const stocks = await StockCLR.findAll({
    where: { companyId },
    include: [
      { model: Produit, as: "produit", attributes: ["sku", "nom", "famille"] },
      { model: CLR, as: "clr", attributes: ["nom", "region"] },
    ],
  });
  // ✅ REMPLACE depuis "// Livraisons prévues dans les 7 prochains jours"
  // jusqu'à la fin du livraisonsMap

  // Livraisons prévues : LignePlanif n'a ni quantite ni dateLivraison
  // → on récupère les mouvements ENTREE_LIVRAISON prévus via MouvementStock
  const dans7j = new Date();
  dans7j.getDate() + 7; // ❌ bug silencieux — corrige aussi ça
  dans7j.setDate(dans7j.getDate() + 7); // ✅

  const livraisonsPrevues = await MouvementStock.findAll({
    where: {
      companyId,
      type: "ENTREE_LIVRAISON",
      createdAt: { [Op.between]: [new Date(), dans7j] },
    },
    attributes: [
      "produitId",
      "clrId",
      [
        Sequelize.fn("SUM", Sequelize.fn("ABS", Sequelize.col("quantite"))),
        "totalEntrees",
      ],
    ],
    group: ["produitId", "clrId"],
    raw: true,
  });

  const livraisonsMap = {};
  for (const l of livraisonsPrevues) {
    const key = `${l.produitId}-${l.clrId}`;
    livraisonsMap[key] = parseFloat(l.totalEntrees) || 0;
  }
  const consoMap = {};
  for (const c of conso) {
    const key = `${c.produitId}-${c.clrId}`;
    consoMap[key] = parseFloat(c.totalSorties) / 14; // moyenne/jour
  }

  const previsions = stocks.map((stock) => {
    const key = `${stock.produitId}-${stock.clrId}`;
    const consoJour = consoMap[key] || 0;
    const entrées7j = livraisonsMap[key] || 0;
    const stockPrevu = stock.qteDisponible - consoJour * 7 + entrées7j;
    const joursAvantRupture =
      consoJour > 0 ? Math.floor(stock.qteDisponible / consoJour) : 999;
    return {
      produitId: stock.produitId,
      clrId: stock.clrId,
      sku: stock.produit?.sku,
      nom: stock.produit?.nom, // ← ajouter "nom" en plus de nomProduit
      nomProduit: stock.produit?.nom,
      famille: stock.produit?.famille,
      nomCLR: stock.clr?.nom,
      regionCLR: stock.clr?.region,
      stockActuel: stock.qteDisponible,
      consoJournalière: Math.round(consoJour * 10) / 10,
      prevuConsomme: Math.round(consoJour * 7 * 10) / 10, // ← NOUVEAU
      entrées7j,
      stockPrevu7j: Math.max(0, Math.round(stockPrevu * 10) / 10),
      stockFinal: Math.max(0, Math.round(stockPrevu * 10) / 10), // ← NOUVEAU alias
      joursAvantRupture: Math.min(joursAvantRupture, 999),
      risqueRupture: joursAvantRupture <= 7 && consoJour > 0, // ← NOUVEAU
      risque:
        joursAvantRupture <= 3
          ? "ÉLEVÉ"
          : joursAvantRupture <= 7
            ? "MODÉRÉ"
            : "FAIBLE",
    };
  });

  // Trier par risque
  const ordreRisque = { ÉLEVÉ: 0, MODÉRÉ: 1, FAIBLE: 2 };
  previsions.sort((a, b) => ordreRisque[a.risque] - ordreRisque[b.risque]);

  return {
    horizon: "J+7",
    total: previsions.length,
    risqueElevé: previsions.filter((p) => p.risque === "ÉLEVÉ").length,
    risqueModéré: previsions.filter((p) => p.risque === "MODÉRÉ").length,
    previsions,
  };
}

// ─────────────────────────────────────────────
// DONNÉES CARTE GÉO
// ─────────────────────────────────────────────

/**
 * Données pour la carte géographique : niveau de stock global par CLR
 * @param {number} companyId
 * @returns {Array} CLR avec coordonnées et niveau stock agrégé
 */
async function getDataCarte(companyId) {
  const clrs = await CLR.findAll({
    include: [
      {
        model: StockCLR,
        as: "stocks",
        where: { companyId },
        required: false,
      },
    ],
  });
  console.log("CLR TOTAL:", clrs.length);
  console.log(
    "CLR RAW:",
    clrs.map((c) => c.toJSON()),
  );
  return clrs.map((clr) => {
    const stocks = clr.stocks || [];
    const total = stocks.reduce((sum, s) => sum + (s.qteDisponible || 0), 0);
    const reservee = stocks.reduce((sum, s) => sum + (s.qteReservee || 0), 0);

    // Calcul niveau global : % moyen vs seuils optimaux
    let niveauPct = 100;
    const stocksAvecSeuil = stocks.filter((s) => s.seuilAlerte);
    if (stocksAvecSeuil.length > 0) {
      const pcts = stocksAvecSeuil.map((s) =>
        s.seuilAlerte.seuilOptimal > 0
          ? Math.min(100, (s.qteDisponible / s.seuilAlerte.seuilOptimal) * 100)
          : 100,
      );
      niveauPct = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    }

    return {
      id: clr.id, // ✅ ajoute id
      clrId: clr.id,
      nom: clr.nom,
      region: clr.region,
      latitude: clr.latitude || null,
      longitude: clr.longitude || null,
      nbProduits: stocks.length,
      stockTotal: Math.round(total),
      qteReservee: Math.round(reservee),
      niveauPct,
      statut:
        niveauPct <= 20 ? "CRITIQUE" : niveauPct <= 50 ? "ATTENTION" : "OK",
    };
  });
}

module.exports = {
  analyserRuptures,
  analyserRotations,
  calculerPrevisions,
  getDataCarte,
};
