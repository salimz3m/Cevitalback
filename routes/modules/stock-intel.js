/**
 * routes/modules/stock-intel.js — Sprint 7
 * Module Stock Intelligent : ruptures, rotations, prévisions, carte
 */

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../../middleware/auth");
const {
  analyserRuptures,
  analyserRotations,
  calculerPrevisions,
  getDataCarte,
} = require("../../services/modules/stockAnalyzer");
const { requireModule } = require("../../middleware/moduleGate");
router.use(authenticate);
router.use(authorize("admin", "planification", "transport", "keep_contact"));
router.use(requireModule("STOCK_INTEL"));
/**
 * GET /api/modules/stock-intel/ruptures
 * Analyse ruptures et alertes par produit + localisation CLR
 */
router.get("/ruptures", async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const data = await analyserRuptures(companyId);

    res.json({
      success: true,
      source: "heuristique",
      generatedAt: new Date().toISOString(),
      ...data,
    });
  } catch (err) {
    console.error("stock-intel/ruptures:", err);
    res
      .status(500)
      .json({ error: "Erreur analyse ruptures", detail: err.message });
  }
});

/**
 * GET /api/modules/stock-intel/rotations
 * Produits à forte/faible rotation (30 derniers jours)
 * Query : ?famille=HUILE&top=10
 */
router.get("/rotations", async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { famille, top } = req.query;

    let data = await analyserRotations(companyId);

    // 🔍 Log pour voir ce que retourne vraiment le service
    console.log("analyserRotations result:", JSON.stringify(data));

    // ✅ Garde défensive
    if (!data || !Array.isArray(data.rotations)) {
      return res.status(500).json({
        error: "Données rotations invalides",
        detail: `analyserRotations a retourné: ${JSON.stringify(data)}`,
      });
    }

    if (famille) {
      data.rotations = data.rotations.filter(
        (r) => r.famille?.toLowerCase() === famille.toLowerCase(),
      );
    }

    if (top) {
      data.rotations = data.rotations.slice(0, parseInt(top, 10));
    }

    res.json({
      success: true,
      source: "heuristique",
      generatedAt: new Date().toISOString(),
      ...data,
    });
  } catch (err) {
    console.error("🔴 ROTATIONS:", err.message, err.stack);
    res
      .status(500)
      .json({ error: "Erreur analyse rotations", detail: err.message });
  }
});
/**
 * GET /api/modules/stock-intel/previsions
 * Prévisions stock J+7 basées sur consommation + planif
 * Query : ?risque=ÉLEVÉ — filtrer par risque
 */
router.get("/previsions", async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { risque } = req.query;

    let data = await calculerPrevisions(companyId);

    console.log("calculerPrevisions result:", JSON.stringify(data));

    // ✅ Garde défensive
    if (!data || !Array.isArray(data.previsions)) {
      return res.status(500).json({
        error: "Données prévisions invalides",
        detail: `calculerPrevisions a retourné: ${JSON.stringify(data)}`,
      });
    }

    if (risque) {
      data.previsions = data.previsions.filter(
        (p) => p.risque === risque.toUpperCase(),
      );
    }

    res.json({
      success: true,
      source: "heuristique",
      horizon: "J+7",
      generatedAt: new Date().toISOString(),
      ...data,
    });
  } catch (err) {
    console.error("stock-intel/previsions ERROR:", err.stack || err);
    res
      .status(500)
      .json({ error: "Erreur calcul prévisions", detail: err.message });
  }
});
/**
 * GET /api/modules/stock-intel/carte
 * Données pour carte géo : niveau de stock par CLR (pour CarteStocks.jsx)
 */
router.get("/carte", async (req, res) => {
  console.log("USER:", req.user);
  console.log("ROLE:", req.user?.role);
  console.log("COMPANY:", req.user?.companyId);

  try {
    const companyId = req.user.companyId;
    const clrs = await getDataCarte(companyId);

    // Résumé global
    const totaux = {
      total: clrs.length,
      ok: clrs.filter((c) => c.statut === "OK").length,
      attention: clrs.filter((c) => c.statut === "ATTENTION").length,
      critique: clrs.filter((c) => c.statut === "CRITIQUE").length,
    };

    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      totaux,
      clrs,
    });
  } catch (err) {
    console.error("stock-intel/carte:", err);
    res
      .status(500)
      .json({ error: "Erreur données carte", detail: err.message });
  }
});

/**
 * GET /api/modules/stock-intel/dashboard
 * Vue synthèse complète pour StockIntelligent.jsx
 * Combine ruptures + rotations top 5 + prévisions critiques
 */
router.get("/dashboard", async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const [ruptures, rotations, previsions, carte] = await Promise.all([
      analyserRuptures(companyId),
      analyserRotations(companyId),
      calculerPrevisions(companyId),
      getDataCarte(companyId),
    ]);

    // Heuristiques score global
    const scoreStock = Math.max(
      0,
      100 -
        ruptures.ruptures * 20 -
        ruptures.critiques * 10 -
        ruptures.attentions * 3,
    );

    const tendance =
      ruptures.ruptures === 0 && ruptures.critiques === 0
        ? "BON"
        : ruptures.ruptures > 2
          ? "CRITIQUE"
          : "ATTENTION";

    res.json({
      success: true,
      source: "heuristique",
      generatedAt: new Date().toISOString(),
      scoreStock,
      tendance,
      resume: {
        totalAlertes: ruptures.total,
        ruptures: ruptures.ruptures,
        critiques: ruptures.critiques,
        previsionsCritiques: previsions.risqueElevé,
        clrsCritiques: carte.filter((c) => c.statut === "CRITIQUE").length,
      },
      alertesPrioritaires: ruptures.alertes.slice(0, 5),
      topRotation: rotations.rotations.slice(0, 5),
      flopRotation: rotations.rotations.slice(-5).reverse(),
      previsionsCritiques: previsions.previsions
        .filter((p) => p.risque === "ÉLEVÉ")
        .slice(0, 5),
      carteResume: carte,
      recommandations: genererRecommandations(ruptures, rotations, previsions),
    });
  } catch (err) {
    console.error("stock-intel/dashboard:", err);
    res
      .status(500)
      .json({ error: "Erreur dashboard stock", detail: err.message });
  }
});

// ─────────────────────────────────────────────
// Helper : générer recommandations heuristiques
// ─────────────────────────────────────────────
function genererRecommandations(ruptures, rotations, previsions) {
  const reco = [];

  if (ruptures.ruptures > 0) {
    reco.push({
      priorite: "HAUTE",
      action: `Réapprovisionner immédiatement ${ruptures.ruptures} produit(s) en rupture totale`,
      impact: "Bloque les livraisons planifiées",
    });
  }

  if (previsions.risqueElevé > 0) {
    reco.push({
      priorite: "HAUTE",
      action: `Planifier livraison urgente pour ${previsions.risqueElevé} produit(s) à risque de rupture dans 3 jours`,
      impact: "Évite les ruptures imminentes",
    });
  }

  const faiblsRotation = rotations.rotations
    .filter((r) => r.categorie === "FAIBLE")
    .slice(0, 3);
  if (faiblsRotation.length > 0) {
    reco.push({
      priorite: "MOYENNE",
      action: `Réduire les commandes de ${faiblsRotation.map((p) => p.nom).join(", ")} (faible rotation)`,
      impact: "Optimise le stock dormant",
    });
  }

  if (ruptures.total === 0) {
    reco.push({
      priorite: "INFO",
      action: "Niveaux de stock satisfaisants sur l'ensemble du réseau CLR",
      impact: "Aucune action immédiate requise",
    });
  }

  return reco;
}

module.exports = router;
