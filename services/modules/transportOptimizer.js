// services/modules/transportOptimizer.js
//
// ╔══════════════════════════════════════════════════════════════════╗
// ║  TRANSPORT OPTIMIZER — Sprint 5                                 ║
// ║  Architecture modulaire scalable (prêt pour IA future)         ║
// ║                                                                  ║
// ║  Modules actifs (heuristiques) :                                ║
// ║   • regroupementOptimal()   — regroupe les lignes par CLR/date  ║
// ║   • scorerPrestataires()    — note les prestataires par histori ║
// ║   • estimerCoutDelai()      — modèle coût/délai par région      ║
// ║   • detecterAlertes()       — retards, incidents, congestion    ║
// ║   • analyserPerformance()   — KPI prestataires sur fenêtre      ║
// ║                                                                  ║
// ║  Pour brancher l'IA : remplacer chaque fonction par un appel   ║
// ║  vers claude-service.js en gardant le même contrat de retour.  ║
// ╚══════════════════════════════════════════════════════════════════╝

const {
  OrdreTransport,
  SuiviTransport,
  LignePlanif,
  PlanifSession,
  Order,
  OrderItem,
  CLR,
} = require("../../models");
const { Op } = require("sequelize");

// ─────────────────────────────────────────────────────────────
// CONSTANTES MÉTIER
// Centraliser ici pour faciliter la future configuration admin
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  // Délais standard par région (heures)
  DELAIS_REGION: {
    EST: { min: 4, max: 8, label: "4–8h" },
    CENTRE: { min: 2, max: 5, label: "2–5h" },
    OUEST: { min: 6, max: 12, label: "6–12h" },
    DEFAULT: { min: 5, max: 10, label: "5–10h" },
  },
  // Coûts indicatifs par région (DA / palette)
  COUT_PALETTE: {
    EST: 3500,
    CENTRE: 2800,
    OUEST: 4200,
    DEFAULT: 3500,
  },
  // Seuil retard (heures au-delà de dateArriveePrevue)
  SEUIL_RETARD_H: 2,
  // Fenêtre d'analyse performance prestataire (jours)
  FENETRE_PERF_JOURS: 30,
  // Score minimum pour recommander un prestataire
  SCORE_MIN_RECOMMANDE: 60,
  // Taux remplissage optimal camion (%)
  TAUX_REMPLISSAGE_OPTIMAL: 85,
};

// ─────────────────────────────────────────────────────────────
// MODULE 1 : REGROUPEMENT OPTIMAL DES LIGNES
// Regroupe les lignes ENVOYEE_TRANSPORT par CLR de destination
// et suggère des lots optimaux (même CLR, même fenêtre de date)
// ─────────────────────────────────────────────────────────────
async function regroupementOptimal(companyId) {
  // Récupérer toutes les lignes disponibles (sessions VALIDEE/ENVOYEE)
  const sessions = await PlanifSession.findAll({
    where: {
      companyId,
      statut: { [Op.in]: ["VALIDEE", "ENVOYEE", "BROUILLON"] },
    },
    include: [
      {
        model: LignePlanif,
        as: "lignes",
        where: {
          statut: { [Op.in]: ["PLANIFIEE", "ENVOYEE_TRANSPORT", "LIVREE"] },
        },
        required: true,
        include: [
          {
            model: Order,
            as: "order",
            include: [{ model: OrderItem, as: "OrderItems" }],
          },
          {
            model: CLR,
            as: "clr",
            attributes: ["id", "code", "nom", "wilaya", "region"],
          },
        ],
      },
    ],
  });

  // Aplatir toutes les lignes disponibles
  const toutesLignes = [];
  for (const session of sessions) {
    for (const ligne of session.lignes) {
      toutesLignes.push({
        ligneId: ligne.id,
        sessionId: session.id,
        sessionDate: session.date,
        clrId: ligne.clrId,
        clr: ligne.clr,
        diapason: ligne.diapason,
        orderId: ligne.orderId,
        orderNumber: ligne.order?.orderNumber,
        items: ligne.order?.OrderItems || [],
        qteTotale: (ligne.order?.OrderItems || []).reduce(
          (sum, i) => sum + (i.quantity || 0),
          0,
        ),
      });
    }
  }

  if (toutesLignes.length === 0) {
    return { groupes: [], totalLignes: 0, suggestions: [] };
  }

  // Grouper par CLR de destination
  const groupesParCLR = {};
  for (const ligne of toutesLignes) {
    const key = String(ligne.clrId);
    if (!groupesParCLR[key]) {
      groupesParCLR[key] = {
        clrId: ligne.clrId,
        clr: ligne.clr,
        lignes: [],
        qteTotale: 0,
        sessions: new Set(),
      };
    }
    groupesParCLR[key].lignes.push(ligne);
    groupesParCLR[key].qteTotale += ligne.qteTotale;
    groupesParCLR[key].sessions.add(ligne.sessionId);
  }

  // Construire les suggestions de regroupement
  const suggestions = Object.values(groupesParCLR).map((groupe) => {
    const region = groupe.clr?.region || "DEFAULT";
    const delaiConfig =
      CONFIG.DELAIS_REGION[region] || CONFIG.DELAIS_REGION.DEFAULT;
    const coutEstime =
      (groupe.qteTotale || 1) *
      (CONFIG.COUT_PALETTE[region] || CONFIG.COUT_PALETTE.DEFAULT);
    const tauxRemplissage = Math.min(
      100,
      Math.round((groupe.qteTotale / 33) * 100),
    ); // 33 pal = camion standard
    const priorite = _calculerPriorite(groupe);

    return {
      clrId: groupe.clrId,
      clrCode: groupe.clr?.code,
      clrNom: groupe.clr?.nom,
      wilaya: groupe.clr?.wilaya,
      region,
      nbLignes: groupe.lignes.length,
      nbSessions: groupe.sessions.size,
      ligneIds: groupe.lignes.map((l) => l.ligneId),
      sessionIds: [...groupe.sessions],
      qteTotale: Math.round(groupe.qteTotale),
      tauxRemplissage,
      delaiEstime: delaiConfig.label,
      coutEstimeDZD: coutEstime,
      priorite, // HIGH / MEDIUM / LOW
      prioriteScore: priorite === "HIGH" ? 3 : priorite === "MEDIUM" ? 2 : 1,
      recommandation: _texteRecommandation(groupe, tauxRemplissage, priorite),
    };
  });

  // Trier par priorité décroissante
  suggestions.sort((a, b) => b.prioriteScore - a.prioriteScore);

  return {
    groupes: suggestions,
    totalLignes: toutesLignes.length,
    totalCLR: suggestions.length,
    resume: `${toutesLignes.length} ligne(s) à expédier vers ${suggestions.length} CLR`,
  };
}

function _calculerPriorite(groupe) {
  // HIGH si plusieurs sessions en attente ou grosse quantité
  if (groupe.sessions.size >= 2 || groupe.qteTotale >= 50) return "HIGH";
  if (groupe.qteTotale >= 20 || groupe.lignes.length >= 3) return "MEDIUM";
  return "LOW";
}

function _texteRecommandation(groupe, tauxRemplissage, priorite) {
  const parts = [];
  if (priorite === "HIGH") parts.push("⚡ Expédition urgente recommandée");
  if (tauxRemplissage >= CONFIG.TAUX_REMPLISSAGE_OPTIMAL)
    parts.push(`✓ Chargement optimal (${tauxRemplissage}%)`);
  else if (tauxRemplissage < 50)
    parts.push(
      `⚠ Chargement partiel (${tauxRemplissage}%) — envisager mutualisation`,
    );
  if (groupe.sessions.size > 1)
    parts.push(`${groupe.sessions.size} sessions combinées`);
  return parts.join(" · ") || "Prêt pour expédition";
}

// ─────────────────────────────────────────────────────────────
// MODULE 2 : SCORING PRESTATAIRES
// Analyse l'historique des ordres pour noter chaque prestataire
// ─────────────────────────────────────────────────────────────
async function scorerPrestataires(companyId) {
  const depuis = new Date();
  depuis.setDate(depuis.getDate() - CONFIG.FENETRE_PERF_JOURS);

  const ordresHistoriques = await OrdreTransport.findAll({
    where: {
      companyId,
      statut: ["LIVRE", "INCIDENT"],
      prestataire: { [Op.ne]: null },
      createdAt: { [Op.gte]: depuis },
    },
    include: [{ model: SuiviTransport, as: "suivis" }],
  });

  // Agréger par prestataire
  const stats = {};
  for (const ordre of ordresHistoriques) {
    const nom = ordre.prestataire;
    if (!stats[nom]) {
      stats[nom] = {
        nom,
        total: 0,
        livres: 0,
        incidents: 0,
        retards: 0,
        delaisMoyens: [],
        score: 0,
      };
    }
    stats[nom].total++;

    if (ordre.statut === "LIVRE") {
      stats[nom].livres++;
      // Calcul retard
      if (ordre.dateArriveePrevue && ordre.dateLivraisonReelle) {
        const prevue = new Date(ordre.dateArriveePrevue);
        const reelle = new Date(ordre.dateLivraisonReelle);
        const diffH = (reelle - prevue) / 3600000;
        if (diffH > CONFIG.SEUIL_RETARD_H) stats[nom].retards++;
        stats[nom].delaisMoyens.push(
          (new Date(ordre.dateLivraisonReelle) - new Date(ordre.dateDepart)) /
            3600000,
        );
      }
    }
    if (ordre.statut === "INCIDENT") stats[nom].incidents++;
  }

  // Calculer les scores (sur 100)
  const scores = Object.values(stats).map((s) => {
    const tauxLivraison = s.total > 0 ? (s.livres / s.total) * 100 : 50;
    const tauxPonctualite =
      s.livres > 0 ? ((s.livres - s.retards) / s.livres) * 100 : 50;
    const penaliteIncident = Math.min(30, s.incidents * 10);
    const delaiMoyen =
      s.delaisMoyens.length > 0
        ? s.delaisMoyens.reduce((a, b) => a + b, 0) / s.delaisMoyens.length
        : null;

    // Score pondéré : 50% livraison + 30% ponctualité + 20% bonus expérience
    const bonusExp = Math.min(20, s.total * 2);
    const score = Math.round(
      tauxLivraison * 0.5 + tauxPonctualite * 0.3 + bonusExp - penaliteIncident,
    );

    return {
      nom: s.nom,
      score: Math.max(0, Math.min(100, score)),
      tauxLivraison: Math.round(tauxLivraison),
      tauxPonctualite: Math.round(tauxPonctualite),
      nbMissions: s.total,
      nbIncidents: s.incidents,
      delaiMoyenH: delaiMoyen ? Math.round(delaiMoyen * 10) / 10 : null,
      recommande: score >= CONFIG.SCORE_MIN_RECOMMANDE,
      niveau:
        score >= 80
          ? "EXCELLENT"
          : score >= 60
            ? "BON"
            : score >= 40
              ? "MOYEN"
              : "RISQUE",
    };
  });

  scores.sort((a, b) => b.score - a.score);

  return {
    prestataires: scores,
    fenetre: `${CONFIG.FENETRE_PERF_JOURS} derniers jours`,
    meilleur: scores[0] || null,
    aRisque: scores.filter((s) => s.niveau === "RISQUE"),
  };
}

// ─────────────────────────────────────────────────────────────
// MODULE 3 : ESTIMATION COÛT / DÉLAI
// Modèle heuristique basé sur région, quantité, historique
// ─────────────────────────────────────────────────────────────
function estimerCoutDelai(
  clrRegion,
  qtePalettes,
  prestataire = null,
  statsPrestataire = null,
) {
  const region = clrRegion || "DEFAULT";
  const delaiConfig =
    CONFIG.DELAIS_REGION[region] || CONFIG.DELAIS_REGION.DEFAULT;
  const coutBase =
    (qtePalettes || 1) *
    (CONFIG.COUT_PALETTE[region] || CONFIG.COUT_PALETTE.DEFAULT);

  // Ajustement si on a l'historique du prestataire
  let facteurDelai = 1.0;
  let facteurCout = 1.0;
  let note = null;

  if (statsPrestataire) {
    if (statsPrestataire.tauxPonctualite < 70) {
      facteurDelai = 1.3;
      note = "⚠ Prestataire avec historique de retards — marge ajoutée";
    } else if (statsPrestataire.tauxPonctualite >= 90) {
      facteurDelai = 0.9;
      note = "✓ Prestataire fiable — délai optimiste";
    }
  }

  // Surcharge week-end (vendredi/samedi en Algérie)
  const jourSemaine = new Date().getDay(); // 0=dim, 5=ven, 6=sam
  const surchargeWeekend = [5, 6].includes(jourSemaine);
  if (surchargeWeekend) {
    facteurDelai *= 1.15;
    facteurCout *= 1.1;
  }

  return {
    region,
    delaiMinH: Math.round(delaiConfig.min * facteurDelai),
    delaiMaxH: Math.round(delaiConfig.max * facteurDelai),
    delaiLabel: `${Math.round(delaiConfig.min * facteurDelai)}–${Math.round(delaiConfig.max * facteurDelai)}h`,
    coutEstimeDZD: Math.round(coutBase * facteurCout),
    coutParPalette: CONFIG.COUT_PALETTE[region] || CONFIG.COUT_PALETTE.DEFAULT,
    surchargeWeekend,
    note,
  };
}

// ─────────────────────────────────────────────────────────────
// MODULE 4 : DÉTECTION ALERTES
// Scrute les ordres actifs pour détecter retards & incidents
// ─────────────────────────────────────────────────────────────
async function detecterAlertes(companyId) {
  const maintenant = new Date();

  const ordresActifs = await OrdreTransport.findAll({
    where: {
      companyId,
      statut: { [Op.in]: ["CREE", "EN_ROUTE", "LIVRE"] },
    },
    include: [
      {
        model: SuiviTransport,
        as: "suivis",
        limit: 1,
        order: [["createdAt", "DESC"]],
      },
    ],
  });

  const alertes = [];

  for (const ordre of ordresActifs) {
    // Alerte 1 : retard prévu
    if (ordre.dateArriveePrevue && ordre.statut === "EN_ROUTE") {
      const prevue = new Date(ordre.dateArriveePrevue);
      const retardH = (maintenant - prevue) / 3600000;
      if (retardH > CONFIG.SEUIL_RETARD_H) {
        alertes.push({
          type: "RETARD",
          niveau: retardH > 6 ? "CRITIQUE" : "WARNING",
          ordreId: ordre.id,
          prestataire: ordre.prestataire,
          clrId: ordre.clrId,
          message: `Ordre #${ordre.id} — retard de ${Math.round(retardH)}h (prévu ${_formatDate(prevue)})`,
          retardH: Math.round(retardH),
          action: "Contacter le prestataire et notifier le CLR destinataire",
        });
      }
    }

    // Alerte 2 : ordre CREE depuis trop longtemps sans démarrer
    if (ordre.statut === "CREE") {
      const ageCree = (maintenant - new Date(ordre.createdAt)) / 3600000;
      if (ageCree > 24) {
        alertes.push({
          type: "NON_DEMARRE",
          niveau: ageCree > 48 ? "CRITIQUE" : "WARNING",
          ordreId: ordre.id,
          prestataire: ordre.prestataire || "Non affecté",
          clrId: ordre.clrId,
          message: `Ordre #${ordre.id} créé il y a ${Math.round(ageCree)}h — non encore démarré`,
          ageCreeH: Math.round(ageCree),
          action: ordre.prestataire
            ? "Confirmer le départ avec le prestataire"
            : "Affecter un prestataire en urgence",
        });
      }
    }

    // Alerte 3 : incident actif
    if (ordre.statut === "INCIDENT") {
      const dernierSuivi = ordre.suivis?.[0];
      alertes.push({
        type: "INCIDENT",
        niveau: "CRITIQUE",
        ordreId: ordre.id,
        prestataire: ordre.prestataire,
        clrId: ordre.clrId,
        message: `Ordre #${ordre.id} en INCIDENT${dernierSuivi?.commentaire ? ` — ${dernierSuivi.commentaire}` : ""}`,
        action: "Ouvrir une procédure de gestion d'incident",
      });
    }
  }

  // Trier : CRITIQUE d'abord
  alertes.sort((a, b) => (a.niveau === "CRITIQUE" ? -1 : 1));

  return {
    alertes,
    nbCritiques: alertes.filter((a) => a.niveau === "CRITIQUE").length,
    nbWarnings: alertes.filter((a) => a.niveau === "WARNING").length,
    total: alertes.length,
  };
}

// ─────────────────────────────────────────────────────────────
// MODULE 5 : ANALYSE PERFORMANCE GLOBALE (KPI)
// ─────────────────────────────────────────────────────────────
async function analyserPerformance(companyId) {
  const depuis = new Date();
  depuis.setDate(depuis.getDate() - CONFIG.FENETRE_PERF_JOURS);

  const ordres = await OrdreTransport.findAll({
    where: {
      companyId,
      createdAt: { [Op.gte]: depuis },
    },
  });

  const total = ordres.length;
  const livres = ordres.filter((o) => o.statut === "LIVRE").length;
  const incidents = ordres.filter((o) => o.statut === "INCIDENT").length;
  const enCours = ordres.filter((o) =>
    ["CREE", "EN_ROUTE"].includes(o.statut),
  ).length;

  const ordresLivresAvecDates = ordres.filter(
    (o) => o.statut === "LIVRE" && o.dateDepart && o.dateLivraisonReelle,
  );
  const delaiMoyen =
    ordresLivresAvecDates.length > 0
      ? ordresLivresAvecDates.reduce((sum, o) => {
          return (
            sum +
            (new Date(o.dateLivraisonReelle) - new Date(o.dateDepart)) / 3600000
          );
        }, 0) / ordresLivresAvecDates.length
      : null;

  const ordresEnRetard = ordres.filter((o) => {
    if (o.statut !== "LIVRE" || !o.dateArriveePrevue || !o.dateLivraisonReelle)
      return false;
    return (
      (new Date(o.dateLivraisonReelle) - new Date(o.dateArriveePrevue)) /
        3600000 >
      CONFIG.SEUIL_RETARD_H
    );
  }).length;

  const tauxService = total > 0 ? Math.round((livres / total) * 100) : null;
  const tauxPonctualite =
    livres > 0 ? Math.round(((livres - ordresEnRetard) / livres) * 100) : null;

  return {
    periode: `${CONFIG.FENETRE_PERF_JOURS} derniers jours`,
    kpi: {
      totalOrdres: total,
      ordresLivres: livres,
      ordresEnCours: enCours,
      ordresIncidents: incidents,
      tauxService: tauxService !== null ? `${tauxService}%` : "N/A",
      tauxPonctualite: tauxPonctualite !== null ? `${tauxPonctualite}%` : "N/A",
      delaiMoyenH: delaiMoyen ? Math.round(delaiMoyen * 10) / 10 : null,
      ordresEnRetard,
    },
    tendance: _calculerTendance(tauxService),
  };
}

function _calculerTendance(tauxService) {
  if (tauxService === null) return "INSUFFISANT";
  if (tauxService >= 95) return "EXCELLENT";
  if (tauxService >= 85) return "BON";
  if (tauxService >= 70) return "MOYEN";
  return "A_AMELIORER";
}

// ─────────────────────────────────────────────────────────────
// POINT D'ENTRÉE PRINCIPAL
// Agrège tous les modules en un seul appel pour le dashboard
// ─────────────────────────────────────────────────────────────
async function getSuggestions(companyId) {
  const [regroupement, prestataires, alertes, performance] = await Promise.all([
    regroupementOptimal(companyId),
    scorerPrestataires(companyId),
    detecterAlertes(companyId),
    analyserPerformance(companyId),
  ]);

  return {
    timestamp: new Date().toISOString(),
    companyId,
    regroupement,
    prestataires,
    alertes,
    performance,
    // Résumé exécutif
    resume: {
      actionRequise: alertes.nbCritiques > 0 || regroupement.totalLignes > 0,
      nbAlertsCritiques: alertes.nbCritiques,
      nbLignesAExpedier: regroupement.totalLignes,
      nbGroupesSuggeres: regroupement.totalCLR,
      meilleurPrestataire: prestataires.meilleur?.nom || null,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────
function _formatDate(date) {
  return new Date(date).toLocaleString("fr-DZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

module.exports = {
  getSuggestions,
  regroupementOptimal,
  scorerPrestataires,
  estimerCoutDelai,
  detecterAlertes,
  analyserPerformance,
  CONFIG, // exporté pour les tests et la future config admin
};
