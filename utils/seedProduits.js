/**
 * utils/seedProduits.js — Sprint 7
 * Seed catalogue produits Cevital (35 références) + seuils d'alerte par défaut
 * Usage : node utils/seedProduits.js
 */

const { sequelize, Produit, SeuilAlerte, CLR, Company } = require("../models");

const PRODUITS_CEVITAL = [
  // ── HUILES (marque Fleurial + Elio) ──────────────────────
  {
    sku: "HUI-FLE-1L",
    nom: "Huile Fleurial Tournesol 1L",
    famille: "HUILE",
    marque: "Fleurial",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 0.92,
  },
  {
    sku: "HUI-FLE-2L",
    nom: "Huile Fleurial Tournesol 2L",
    famille: "HUILE",
    marque: "Fleurial",
    unite: "carton",
    qteParCarton: 6,
    poidsKg: 1.86,
  },
  {
    sku: "HUI-FLE-5L",
    nom: "Huile Fleurial Tournesol 5L",
    famille: "HUILE",
    marque: "Fleurial",
    unite: "carton",
    qteParCarton: 4,
    poidsKg: 4.6,
  },
  {
    sku: "HUI-FRY-1L",
    nom: "Huile Fleurial Spéciale Friture 1L",
    famille: "HUILE",
    marque: "Fleurial",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 0.92,
  },
  {
    sku: "HUI-FRY-2L",
    nom: "Huile Fleurial Spéciale Friture 2L",
    famille: "HUILE",
    marque: "Fleurial",
    unite: "carton",
    qteParCarton: 6,
    poidsKg: 1.86,
  },
  {
    sku: "HUI-ELI-1L",
    nom: "Huile Elio Tournesol 1L",
    famille: "HUILE",
    marque: "Elio",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 0.92,
  },
  {
    sku: "HUI-ELI-5L",
    nom: "Huile Elio Tournesol 5L",
    famille: "HUILE",
    marque: "Elio",
    unite: "carton",
    qteParCarton: 4,
    poidsKg: 4.6,
  },
  {
    sku: "HUI-TCH-1L",
    nom: "Huile Tchina 1L",
    famille: "HUILE",
    marque: "Tchina",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 0.92,
  },

  // ── MARGARINE ────────────────────────────────────────────
  {
    sku: "MAR-FLE-250",
    nom: "Margarine Fleurial Table 250g",
    famille: "MARGARINE",
    marque: "Fleurial",
    unite: "carton",
    qteParCarton: 24,
    poidsKg: 0.25,
  },
  {
    sku: "MAR-FLE-500",
    nom: "Margarine Fleurial Table 500g",
    famille: "MARGARINE",
    marque: "Fleurial",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 0.5,
  },
  {
    sku: "MAR-ACT-250",
    nom: "Margarine Fleurial Active 250g",
    famille: "MARGARINE",
    marque: "Fleurial",
    unite: "carton",
    qteParCarton: 24,
    poidsKg: 0.25,
  },
  {
    sku: "MAR-MAT-250",
    nom: "Margarine Matina 250g",
    famille: "MARGARINE",
    marque: "Matina",
    unite: "carton",
    qteParCarton: 24,
    poidsKg: 0.25,
  },
  {
    sku: "MAR-MAT-500",
    nom: "Margarine Matina 500g",
    famille: "MARGARINE",
    marque: "Matina",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 0.5,
  },
  {
    sku: "MAR-TGO-5KG",
    nom: "Margarine Tendre Gourmand 5kg",
    famille: "MARGARINE",
    marque: "Tendre Gourmand",
    unite: "carton",
    qteParCarton: 4,
    poidsKg: 5.0,
  },
  {
    sku: "MAR-PAR-1KG",
    nom: "Margarine La Parisienne 1kg",
    famille: "MARGARINE",
    marque: "La Parisienne",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 1.0,
  },

  // ── SUCRE ─────────────────────────────────────────────────
  {
    sku: "SUC-SKO-1KG",
    nom: "Sucre Skor Blanc 1kg",
    famille: "SUCRE",
    marque: "Skor",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 1.0,
  },
  {
    sku: "SUC-SKO-5KG",
    nom: "Sucre Skor Blanc 5kg",
    famille: "SUCRE",
    marque: "Skor",
    unite: "sac",
    qteParCarton: 1,
    poidsKg: 5.0,
  },
  {
    sku: "SUC-SKO-25KG",
    nom: "Sucre Skor Blanc 25kg",
    famille: "SUCRE",
    marque: "Skor",
    unite: "sac",
    qteParCarton: 1,
    poidsKg: 25.0,
  },
  {
    sku: "SUC-SKO-50KG",
    nom: "Sucre Skor Blanc 50kg (export)",
    famille: "SUCRE",
    marque: "Skor",
    unite: "sac",
    qteParCarton: 1,
    poidsKg: 50.0,
  },
  {
    sku: "SUC-MED-1KG",
    nom: "Sucre Medina 1kg",
    famille: "SUCRE",
    marque: "Medina",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 1.0,
  },

  // ── SMEN / CORPS GRAS ────────────────────────────────────
  {
    sku: "SME-ASS-200",
    nom: "Smen Assila 200g",
    famille: "SMEN",
    marque: "Assila",
    unite: "carton",
    qteParCarton: 24,
    poidsKg: 0.2,
  },
  {
    sku: "SME-ASS-400",
    nom: "Smen Assila 400g",
    famille: "SMEN",
    marque: "Assila",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 0.4,
  },
  {
    sku: "SME-MED-1KG",
    nom: "Smen Medina 1kg",
    famille: "SMEN",
    marque: "Medina",
    unite: "carton",
    qteParCarton: 6,
    poidsKg: 1.0,
  },

  // ── CHOCOLAT ─────────────────────────────────────────────
  {
    sku: "CHO-MAT-400",
    nom: "Pâte choco Matina Chocolat 400g",
    famille: "CHOCOLAT",
    marque: "Matina Chocolat",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 0.4,
  },
  {
    sku: "CHO-MAT-800",
    nom: "Pâte choco Matina Chocolat 800g",
    famille: "CHOCOLAT",
    marque: "Matina Chocolat",
    unite: "carton",
    qteParCarton: 6,
    poidsKg: 0.8,
  },

  // ── SAUCES ───────────────────────────────────────────────
  {
    sku: "SAU-FLE-MAY",
    nom: "Mayonnaise Fleurial 250ml",
    famille: "SAUCE",
    marque: "Fleurial Sauces",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 0.25,
  },
  {
    sku: "SAU-FOO-KET",
    nom: "Ketchup FOODY'S 350g",
    famille: "SAUCE",
    marque: "FOODY'S",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 0.35,
  },
  {
    sku: "SAU-FOO-MUS",
    nom: "Moutarde FOODY'S 200g",
    famille: "SAUCE",
    marque: "FOODY'S",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 0.2,
  },

  // ── EAU MINÉRALE ─────────────────────────────────────────
  {
    sku: "EAU-LAL-033",
    nom: "Eau Lalla Khedidja 33cl (pack 6)",
    famille: "EAU",
    marque: "Lalla Khedidja",
    unite: "pack",
    qteParCarton: 4,
    poidsKg: 0.33,
  },
  {
    sku: "EAU-LAL-150",
    nom: "Eau Lalla Khedidja 1,5L (pack 6)",
    famille: "EAU",
    marque: "Lalla Khedidja",
    unite: "pack",
    qteParCarton: 4,
    poidsKg: 1.5,
  },

  // ── MIEL ─────────────────────────────────────────────────
  {
    sku: "MIE-CEV-250",
    nom: "Miel Cevital 250g",
    famille: "MIEL",
    marque: "Cevital",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 0.25,
  },
  {
    sku: "MIE-CEV-500",
    nom: "Miel Cevital 500g",
    famille: "MIEL",
    marque: "Cevital",
    unite: "carton",
    qteParCarton: 6,
    poidsKg: 0.5,
  },

  // ── CONFITURE ────────────────────────────────────────────
  {
    sku: "JAM-CEV-375",
    nom: "Confiture Cevital Fraise 375g",
    famille: "CONFITURE",
    marque: "Cevital",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 0.375,
  },
  {
    sku: "JAM-CEV-750",
    nom: "Confiture Cevital Abricot 750g",
    famille: "CONFITURE",
    marque: "Cevital",
    unite: "carton",
    qteParCarton: 6,
    poidsKg: 0.75,
  },

  // ── BOISSONS ─────────────────────────────────────────────
  {
    sku: "BOI-MAT-100",
    nom: "Jus Matina 100cl assortis",
    famille: "BOISSON",
    marque: "Matina",
    unite: "carton",
    qteParCarton: 12,
    poidsKg: 1.0,
  },

  // ── PALETTE (unité logistique) ───────────────────────────
  {
    sku: "PAL-STD-001",
    nom: "Palette standard (120x80cm)",
    famille: "PALETTE",
    marque: null,
    unite: "unité",
    qteParCarton: 1,
    poidsKg: 25.0,
  },
  {
    sku: "PAL-EUR-001",
    nom: "Palette Europe (120x100cm)",
    famille: "PALETTE",
    marque: null,
    unite: "unité",
    qteParCarton: 1,
    poidsKg: 22.0,
  },
];

// Seuils par défaut selon la famille (cartons)
const SEUILS_PAR_FAMILLE = {
  HUILE: { seuilMinimum: 20, seuilOptimal: 100 },
  MARGARINE: { seuilMinimum: 15, seuilOptimal: 80 },
  SUCRE: { seuilMinimum: 10, seuilOptimal: 50 },
  SMEN: { seuilMinimum: 10, seuilOptimal: 60 },
  CHOCOLAT: { seuilMinimum: 8, seuilOptimal: 40 },
  SAUCE: { seuilMinimum: 10, seuilOptimal: 50 },
  EAU: { seuilMinimum: 20, seuilOptimal: 120 },
  MIEL: { seuilMinimum: 5, seuilOptimal: 30 },
  CONFITURE: { seuilMinimum: 5, seuilOptimal: 30 },
  BOISSON: { seuilMinimum: 10, seuilOptimal: 60 },
  PALETTE: { seuilMinimum: 5, seuilOptimal: 25 },
};

async function seedProduits() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connexion DB OK");

    // Récupérer la première company (pour les seuils)
    const company = await Company.findOne();
    if (!company) {
      throw new Error("Aucune Company trouvée en base. Créez-en une d'abord.");
    }
    const companyId = company.id;

    // Récupérer tous les CLR
    const clrs = await CLR.findAll();
    console.log(`📦 ${clrs.length} CLR trouvés`);

    // ── UPSERT produits ──────────────────────────────────────
    let created = 0;
    let updated = 0;

    for (const produit of PRODUITS_CEVITAL) {
      const produitAvecCompany = { ...produit, companyId, actif: true };

      const [instance, wasCreated] = await Produit.findOrCreate({
        where: { sku: produit.sku },
        defaults: produitAvecCompany,
      });

      if (!wasCreated) {
        await instance.update(produitAvecCompany);
        updated++;
      } else {
        created++;
      }

      // ── Seuils globaux (clrId = null) par produit ──
      const seuil = SEUILS_PAR_FAMILLE[produit.famille] || {
        seuilMinimum: 10,
        seuilOptimal: 50,
      };
      await SeuilAlerte.findOrCreate({
        where: { produitId: instance.id, clrId: null, companyId },
        defaults: {
          produitId: instance.id,
          clrId: null,
          companyId,
          seuilMinimum: seuil.seuilMinimum,
          seuilOptimal: seuil.seuilOptimal,
          actif: true,
        },
      });
    }

    console.log(`✅ Produits : ${created} créés, ${updated} mis à jour`);
    console.log(`✅ Seuils globaux créés pour la company ${companyId}`);
    console.log("🎉 Seed produits terminé !");

    process.exit(0);
  } catch (err) {
    console.error("❌ Erreur seed:", err);
    process.exit(1);
  }
}

seedProduits();
