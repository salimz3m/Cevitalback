const { Op } = require("sequelize");
const {
  StockCLR,
  MouvementStock,
  OrdreTransport,
  PlanifSession,
  LignePlanif,
  Order,
  OrderItem,
  Produit,
  CLR,
  Plateforme,
} = require("../models");

const {
  getDashboardCLR,
  getAlertesRupture,
} = require("./modules/planningAnalyzer");
const {
  analyserRuptures,
  analyserRotations,
  calculerPrevisions,
} = require("./modules/stockAnalyzer");
const {
  analyserPerformance,
  detecterAlertes,
} = require("./modules/transportOptimizer");

// ─────────────────────────────────────────────────────────────
// HELPER : plage de dates
// ─────────────────────────────────────────────────────────────
function plageJours(jours) {
  const fin = new Date();
  const debut = new Date();
  debut.setDate(debut.getDate() - jours);
  return { [Op.between]: [debut, fin] };
}

// ─────────────────────────────────────────────────────────────
// KPI STOCK — valeur totale, ruptures, couverture
// ─────────────────────────────────────────────────────────────
async function kpiStock(companyId) {
  const stocks = await StockCLR.findAll({
    where: { companyId },
    include: [
      {
        model: Produit,
        as: "produit",
        attributes: ["prixUnitaireDZD", "nom", "famille"],
        required: true,
      },
      {
        model: CLR,
        as: "clr",
        attributes: ["id", "code", "nom", "wilaya"],
        required: true,
      },
    ],
  });

  let valeurTotaleDZD = 0;
  let nbProduitsActifs = 0;
  const parFamille = {};

  stocks.forEach((s) => {
    const prix = s.produit?.prixUnitaireDZD || 0;
    const valeur = s.qteDisponible * prix;
    valeurTotaleDZD += valeur;
    if (s.qteDisponible > 0) nbProduitsActifs++;

    const fam = s.produit?.famille || "Autre";
    if (!parFamille[fam]) parFamille[fam] = { famille: fam, qte: 0, valeur: 0 };
    parFamille[fam].qte += s.qteDisponible;
    parFamille[fam].valeur += valeur;
  });

  const ruptures = await analyserRuptures(companyId);

  return {
    valeurTotaleDZD: Math.round(valeurTotaleDZD),
    nbProduitsActifs,
    nbRuptures: ruptures.ruptures || 0,
    nbAlertes: ruptures.total || 0,
    repartitionFamilles: Object.values(parFamille)
      .sort((a, b) => b.valeur - a.valeur)
      .map((f) => ({ ...f, valeur: Math.round(f.valeur) })),
  };
}

// ─────────────────────────────────────────────────────────────
// KPI FLUX — volumes 30/60/90j par type de mouvement
// ─────────────────────────────────────────────────────────────
async function kpiFlux(companyId) {
  const periodes = [30, 60, 90];
  const result = {};

  for (const jours of periodes) {
    const mouvements = await MouvementStock.findAll({
      where: { companyId, createdAt: plageJours(jours) },
      include: [
        {
          model: Produit,
          as: "produit",
          attributes: ["famille"],
          required: false,
        },
      ],
    });

    const entrees = mouvements.filter((m) => m.quantite > 0);
    const sorties = mouvements.filter((m) => m.quantite < 0);

    result[`j${jours}`] = {
      totalEntrees: entrees.reduce((s, m) => s + m.quantite, 0),
      totalSorties: Math.abs(sorties.reduce((s, m) => s + m.quantite, 0)),
      nbMouvements: mouvements.length,
      parType: mouvements.reduce((acc, m) => {
        acc[m.type] = (acc[m.type] || 0) + Math.abs(m.quantite);
        return acc;
      }, {}),
    };
  }

  // Courbe jour par jour sur 30j (pour recharts)
  const courbe30j = await _courbeJournaliere(companyId, 30);

  // Diapasons utilisés dans les sessions
  const diapasons = await LignePlanif.findAll({
    include: [
      {
        model: PlanifSession,
        as: "session",
        where: { companyId },
        attributes: [],
        required: true,
      },
    ],
    attributes: ["diapason"],
  });

  const repartitionDiapasons = diapasons.reduce((acc, l) => {
    acc[l.diapason] = (acc[l.diapason] || 0) + 1;
    return acc;
  }, {});

  return { periodes: result, courbe30j, repartitionDiapasons };
}

async function _courbeJournaliere(companyId, jours) {
  const mouvements = await MouvementStock.findAll({
    where: { companyId, createdAt: plageJours(jours) },
    attributes: ["quantite", "createdAt"],
    order: [["createdAt", "ASC"]],
  });

  const parJour = {};
  mouvements.forEach((m) => {
    const jour = m.createdAt.toISOString().slice(0, 10);
    if (!parJour[jour]) parJour[jour] = { date: jour, entrees: 0, sorties: 0 };
    if (m.quantite > 0) parJour[jour].entrees += m.quantite;
    else parJour[jour].sorties += Math.abs(m.quantite);
  });

  return Object.values(parJour);
}

// ─────────────────────────────────────────────────────────────
// KPI TRANSPORT — taux remplissage, délais, ordres
// ─────────────────────────────────────────────────────────────
async function kpiTransport(companyId) {
  const ordres = await OrdreTransport.findAll({
    include: [
      {
        model: PlanifSession,
        as: "session",
        where: { companyId },
        required: true,
        attributes: [],
      },
    ],
    attributes: ["statut", "tauxRemplissage", "createdAt", "updatedAt"],
  });

  const livres = ordres.filter((o) => o.statut === "LIVRE");
  const enCours = ordres.filter((o) => ["CREE", "EN_ROUTE"].includes(o.statut));

  const tauxMoyen =
    ordres.length > 0
      ? Math.round(
          ordres.reduce((s, o) => s + (o.tauxRemplissage || 0), 0) /
            ordres.length,
        )
      : 0;

  // Performance depuis transportOptimizer
  let performance = null;
  try {
    performance = await analyserPerformance(companyId);
  } catch (_) {}

  // Alertes transport actives
  let alertes = [];
  try {
    alertes = await detecterAlertes(companyId);
  } catch (_) {}

  return {
    nbOrdresTotal: ordres.length,
    nbLivres: livres.length,
    nbEnCours: enCours.length,
    tauxRemplissageMoyen: tauxMoyen,
    performance,
    nbAlertes: Array.isArray(alertes) ? alertes.length : 0,
  };
}

// ─────────────────────────────────────────────────────────────
// KPI COMMANDES — taux service, volumes, CA estimé
// ─────────────────────────────────────────────────────────────
async function kpiCommandes(companyId) {
  const orders = await Order.findAll({
    where: { companyId },
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
    attributes: ["id", "status", "date", "source", "createdAt"],
  });

  const livrees = orders.filter((o) => o.status === "delivered");
  const pending = orders.filter((o) => o.status === "pending");
  const planned = orders.filter((o) => o.status === "planned");

  const caTotal = livrees.reduce((sum, o) => {
    return (
      sum +
      (o.OrderItems || []).reduce((s, i) => {
        return (
          s +
          (i.quantity || 0) * (i.produit?.prixUnitaireDZD || i.unitPrice || 0)
        );
      }, 0)
    );
  }, 0);

  // Volumes 30/60/90j
  const now = new Date();
  const volumes = {};
  for (const jours of [30, 60, 90]) {
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - jours);
    const slice = orders.filter((o) => new Date(o.createdAt) >= cutoff);
    volumes[`j${jours}`] = {
      nbCommandes: slice.length,
      nbLivrees: slice.filter((o) => o.status === "delivered").length,
      tauxService:
        slice.length > 0
          ? Math.round(
              (slice.filter((o) => o.status === "delivered").length /
                slice.length) *
                100,
            )
          : 0,
    };
  }

  // Évolution mensuelle sur 6 mois (pour bar chart)
  const evolutionMensuelle = _evolutionMensuelle(orders);

  return {
    nbTotal: orders.length,
    nbLivrees: livrees.length,
    nbPending: pending.length,
    nbPlanned: planned.length,
    tauxServiceGlobal:
      orders.length > 0
        ? Math.round((livrees.length / orders.length) * 100)
        : 0,
    caEstimeDZD: Math.round(caTotal),
    volumes,
    evolutionMensuelle,
    parSource: orders.reduce((acc, o) => {
      const src = o.source || "EXCEL";
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    }, {}),
  };
}

function _evolutionMensuelle(orders) {
  const parMois = {};
  orders.forEach((o) => {
    const mois = o.createdAt?.toISOString().slice(0, 7) || o.date?.slice(0, 7);
    if (!mois) return;
    if (!parMois[mois]) parMois[mois] = { mois, total: 0, livrees: 0 };
    parMois[mois].total++;
    if (o.status === "delivered") parMois[mois].livrees++;
  });
  return Object.values(parMois)
    .sort((a, b) => a.mois.localeCompare(b.mois))
    .slice(-6);
}

// ─────────────────────────────────────────────────────────────
// SYNTHESE GLOBALE — tout en un seul appel
// ─────────────────────────────────────────────────────────────
async function getSynthese(companyId) {
  const [stock, flux, transport, commandes, dashboardCLR, alertesPlanif] =
    await Promise.allSettled([
      kpiStock(companyId),
      kpiFlux(companyId),
      kpiTransport(companyId),
      kpiCommandes(companyId),
      getDashboardCLR(companyId),
      getAlertesRupture(companyId),
    ]);

  const get = (r) => (r.status === "fulfilled" ? r.value : null);

  // Score santé global 0-100
  const scoreStock = Math.max(
    0,
    100 - (get(stock)?.nbRuptures || 0) * 15 - (get(stock)?.nbAlertes || 0) * 5,
  );
  const scoreTaux = get(commandes)?.tauxServiceGlobal || 0;
  const scoreTransport = get(transport)?.tauxRemplissageMoyen || 0;
  const scoreGlobal = Math.round((scoreStock + scoreTaux + scoreTransport) / 3);

  return {
    generatedAt: new Date().toISOString(),
    scoreGlobal,
    scoreStock,
    scoreTauxService: scoreTaux,
    scoreTransport,
    stock: get(stock),
    flux: get(flux),
    transport: get(transport),
    commandes: get(commandes),
    clrs: get(dashboardCLR),
    alertes: {
      planif: get(alertesPlanif),
      nbCritiques: get(dashboardCLR)?.resume?.totalRouge || 0,
      nbWarnings: get(dashboardCLR)?.resume?.totalOrange || 0,
    },
  };
}

module.exports = { getSynthese, kpiStock, kpiFlux, kpiTransport, kpiCommandes };
