// services/modules/planningAnalyzer.js
//
// Module intelligent Planification — LECTURE SEULE
// Ne modifie jamais de données, produit uniquement des analyses et suggestions

const { Stock, CLR, Plateforme, LignePlanif, PlanifSession, Order, OrderItem } = require("../../models");
const { Op } = require("sequelize");
const sequelize = require("../../config/database");

// ─────────────────────────────────────────────────────────────
// Dashboard couleur par CLR
// Retourne pour chaque CLR : stock actuel, commandes en cours,
// écart, niveau (VERT / ORANGE / ROUGE)
// ─────────────────────────────────────────────────────────────
async function getDashboardCLR(companyId) {
  // 1. Tous les CLR actifs
  const clrs = await CLR.findAll({
    where: { actif: true },
    include: [{ model: Plateforme, as: "plateforme", attributes: ["id", "nom", "region"] }],
    order: [["region", "ASC"], ["code", "ASC"]],
  });

  // 2. Stocks par CLR (depotId = clrId dans notre modèle)
  const stocks = await Stock.findAll({
    where: { companyId },
  });

  // 3. Commandes planifiées non encore livrées (besoin en cours)
  const lignesActives = await LignePlanif.findAll({
    where: { statut: { [Op.in]: ["PLANIFIEE", "ENVOYEE_TRANSPORT"] } },
    include: [
      {
        model: PlanifSession,
        as: "session",
        where: { companyId },
        attributes: [],
      },
      {
        model: Order,
        as: "order",
        include: [{ model: OrderItem, as: "OrderItems" }],
      },
    ],
  });

  // 4. Agréger stock par CLR
  const stockParClr = {};
  stocks.forEach((s) => {
    const key = s.depotId;
    if (!stockParClr[key]) stockParClr[key] = 0;
    stockParClr[key] += s.availableQty || 0;
  });

  // 5. Agréger commandes planifiées par CLR
  const commandesParClr = {};
  lignesActives.forEach((ligne) => {
    const key = ligne.clrId;
    if (!commandesParClr[key]) commandesParClr[key] = 0;
    const items = ligne.order?.OrderItems || [];
    items.forEach((item) => {
      commandesParClr[key] += item.quantity || 0;
    });
  });

  // 6. Construire le dashboard
  const dashboard = clrs.map((clr) => {
    const stockActuel   = stockParClr[clr.id]    || 0;
    const commandesDues = commandesParClr[clr.id] || 0;
    const ecart         = stockActuel - commandesDues;
    const ratio         = commandesDues === 0 ? 1 : stockActuel / commandesDues;

    let niveau, couleur, message;
    if (commandesDues === 0 && stockActuel === 0) {
      niveau  = "NEUTRE";
      couleur = "grey";
      message = "Aucune activité";
    } else if (ecart < 0) {
      niveau  = "ROUGE";
      couleur = "red";
      message = `Rupture : manque ${Math.abs(ecart).toFixed(0)} unités`;
    } else if (ratio < 1.2) {
      niveau  = "ORANGE";
      couleur = "orange";
      message = `Stock faible : ${ecart.toFixed(0)} unités de marge`;
    } else {
      niveau  = "VERT";
      couleur = "green";
      message = `Stock suffisant : ${ecart.toFixed(0)} unités disponibles`;
    }

    return {
      clr: {
        id:       clr.id,
        code:     clr.code,
        nom:      clr.nom,
        wilaya:   clr.wilaya,
        region:   clr.region,
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
  });

  // 7. Résumé global
  const resume = {
    totalVert:   dashboard.filter((d) => d.niveau === "VERT").length,
    totalOrange: dashboard.filter((d) => d.niveau === "ORANGE").length,
    totalRouge:  dashboard.filter((d) => d.niveau === "ROUGE").length,
    totalNeutre: dashboard.filter((d) => d.niveau === "NEUTRE").length,
    clrsEnRupture: dashboard.filter((d) => d.niveau === "ROUGE").map((d) => d.clr.code),
  };

  return { dashboard, resume };
}

// ─────────────────────────────────────────────────────────────
// Suggestion diapason D1 vs D2
// Pour un CLR donné, calcule quelle option est préférable
// ─────────────────────────────────────────────────────────────
async function getSuggestionDiapason(clrId, companyId) {
  const clr = await CLR.findByPk(clrId, {
    include: [{ model: Plateforme, as: "plateforme" }],
  });
  if (!clr) throw new Error("CLR introuvable");

  // Stock actuel au CLR
  const stockCLR = await Stock.findAll({ where: { depotId: clrId, companyId } });
  const stockActuelCLR = stockCLR.reduce((s, r) => s + r.availableQty, 0);

  // Stock à la plateforme de rattachement
  let stockPlateforme = 0;
  let capacitePlateforme = 0;
  if (clr.plateforme) {
    const stockPlat = await Stock.findAll({
      where: { depotId: clr.plateformeId, companyId },
    });
    stockPlateforme    = stockPlat.reduce((s, r) => s + r.availableQty, 0);
    capacitePlateforme = clr.plateforme.capacite || 0;
  }

  // Commandes actives vers ce CLR
  const lignesActives = await LignePlanif.findAll({
    where: { clrId, statut: { [Op.in]: ["PLANIFIEE", "ENVOYEE_TRANSPORT"] } },
    include: [{ model: PlanifSession, as: "session", where: { companyId }, attributes: [] }],
  });
  const nbLignesActives = lignesActives.length;

  // Logique de suggestion
  let suggestion, raison, score;

  if (stockPlateforme > stockActuelCLR * 2 && capacitePlateforme > 0) {
    suggestion = "D1";
    raison     = `La plateforme ${clr.plateforme?.nom} dispose de stock suffisant pour transiter`;
    score      = 85;
  } else if (nbLignesActives > 3) {
    suggestion = "D2";
    raison     = "Volume de livraisons élevé — livraison directe au CLR plus efficace";
    score      = 78;
  } else if (stockActuelCLR < 50) {
    suggestion = "D2";
    raison     = "Stock CLR critique — approvisionnement direct recommandé (D2 plus rapide)";
    score      = 90;
  } else {
    suggestion = "D1";
    raison     = "Flux standard — passage par la plateforme régionale recommandé";
    score      = 65;
  }

  return {
    clr: { id: clr.id, code: clr.code, nom: clr.nom, region: clr.region },
    plateforme: clr.plateforme ? { id: clr.plateforme.id, nom: clr.plateforme.nom } : null,
    stockActuelCLR,
    stockPlateforme,
    nbLignesActives,
    suggestion,
    raison,
    score,
    alternatives: {
      D1: { disponible: !!clr.plateforme, description: `Via ${clr.plateforme?.nom || "N/A"} → ${clr.nom}` },
      D2: { disponible: true,             description: `Direct → ${clr.nom}` },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Alertes rupture anticipée J+3
// CLR dont le stock sera insuffisant dans 3 jours
// ─────────────────────────────────────────────────────────────
async function getAlertesRupture(companyId) {
  const { dashboard } = await getDashboardCLR(companyId);

  const alertes = dashboard
    .filter((d) => d.niveau === "ROUGE" || d.niveau === "ORANGE")
    .map((d) => ({
      clr:          d.clr,
      niveau:       d.niveau,
      stockActuel:  d.stockActuel,
      commandesDues: d.commandesDues,
      ecart:        d.ecart,
      message:      d.message,
      urgence:      d.niveau === "ROUGE" ? "CRITIQUE" : "ATTENTION",
      action:       d.niveau === "ROUGE"
        ? "Planifier un réapprovisionnement immédiat"
        : "Surveiller et prévoir un réapprovisionnement",
    }))
    .sort((a, b) => a.ecart - b.ecart); // Les plus critiques en premier

  return {
    nbAlertes: alertes.length,
    alertes,
    dateAnalyse: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// Simulation de flux
// "Si j'envoie X palettes par D1 vers CLR Y, quel impact ?"
// ─────────────────────────────────────────────────────────────
async function simulerFlux(clrId, quantite, diapason, companyId) {
  const clr = await CLR.findByPk(clrId, {
    include: [{ model: Plateforme, as: "plateforme" }],
  });
  if (!clr) throw new Error("CLR introuvable");

  const stockCLR = await Stock.findAll({ where: { depotId: clrId, companyId } });
  const stockActuelCLR = stockCLR.reduce((s, r) => s + r.availableQty, 0);

  let stockPlat = 0;
  if (clr.plateforme) {
    const sp = await Stock.findAll({ where: { depotId: clr.plateformeId, companyId } });
    stockPlat = sp.reduce((s, r) => s + r.availableQty, 0);
  }

  const simulation = {
    avant: {
      stockCLR:         stockActuelCLR,
      stockPlateforme:  stockPlat,
    },
    apres: {
      stockCLR:        stockActuelCLR + quantite,
      stockPlateforme: diapason === "D1" ? Math.max(0, stockPlat - quantite) : stockPlat,
    },
    impact: {
      gainCLR:           quantite,
      pertePlateforme:   diapason === "D1" ? quantite : 0,
      diapasonUtilise:   diapason,
      clr:               { code: clr.code, nom: clr.nom },
      plateforme:        clr.plateforme?.nom || "N/A",
    },
    faisable: diapason === "D2" || (stockPlat >= quantite),
    alertes:  [],
  };

  if (diapason === "D1" && stockPlat < quantite) {
    simulation.alertes.push(`Stock insuffisant à la plateforme ${clr.plateforme?.nom} (disponible: ${stockPlat}, requis: ${quantite})`);
  }
  if (simulation.apres.stockCLR > 1000) {
    simulation.alertes.push(`Attention : stock CLR post-livraison élevé (${simulation.apres.stockCLR} unités)`);
  }

  return simulation;
}

// ─────────────────────────────────────────────────────────────
// Optimisation chargement
// Maximiser le remplissage camion selon commandes groupées par CLR
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
            include: [{ model: OrderItem, as: "OrderItems" }],
          },
          { model: CLR, as: "clr", attributes: ["id", "code", "nom", "region"] },
        ],
      },
    ],
  });

  if (!session) throw new Error("Session introuvable");

  // Grouper par CLR
  const groupesParClr = {};
  (session.lignes || []).forEach((ligne) => {
    const key = ligne.clrId;
    if (!groupesParClr[key]) {
      groupesParClr[key] = { clr: ligne.clr, lignes: [], quantiteTotale: 0 };
    }
    const items = ligne.order?.OrderItems || [];
    const qte = items.reduce((s, i) => s + (i.quantity || 0), 0);
    groupesParClr[key].lignes.push({ ligneId: ligne.id, orderId: ligne.orderId, quantite: qte });
    groupesParClr[key].quantiteTotale += qte;
  });

  // Suggestion de regroupement par camion (capacité standard : 200 unités)
  const CAPACITE_CAMION = 200;
  const groupes = Object.values(groupesParClr);
  const suggestions = groupes.map((g) => ({
    clr:              g.clr,
    nbLignes:         g.lignes.length,
    quantiteTotale:   g.quantiteTotale,
    nbCamionsNeeded:  Math.ceil(g.quantiteTotale / CAPACITE_CAMION),
    tauxRemplissage:  Math.min(100, Math.round((g.quantiteTotale % CAPACITE_CAMION) / CAPACITE_CAMION * 100)) || 100,
    recommandation:   g.quantiteTotale <= CAPACITE_CAMION
      ? "Un seul camion suffit"
      : `Prévoir ${Math.ceil(g.quantiteTotale / CAPACITE_CAMION)} camions`,
  }));

  return {
    sessionId,
    nbGroupes:    groupes.length,
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
