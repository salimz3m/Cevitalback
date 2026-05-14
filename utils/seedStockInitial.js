const { sequelize, Produit, CLR, Company, StockCLR } = require("../models");

// ─────────────────────────────
// CAPACITÉS LOGISTIQUES RÉELLES
// ─────────────────────────────

const PLATEFORM_CAPACITY = {
  EST: 3500,
  CENTRE: 20000,
  OUEST: 8800,
};

const REGION_FILL = {
  EST: 0.65,
  CENTRE: 0.6,
  OUEST: 0.5,
};

const FAMILY_MULTIPLIER = {
  HUILE: 1.5,
  SUCRE: 1.3,
  MARGARINE: 1.1,
  SMEN: 0.9,
  CHOCOLAT: 0.7,
  SAUCE: 0.8,
  EAU: 1.2,
  BOISSON: 0.9,
  CONFITURE: 0.6,
  MIEL: 0.5,
  PALETTE: 0.3,
};

const CARTONS_PER_PALETTE = 40;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

const FAMILY_BASE = {
  HUILE: 900,
  SUCRE: 700,
  MARGARINE: 550,
  SMEN: 320,
  CHOCOLAT: 220,
  SAUCE: 260,
  EAU: 750,
  BOISSON: 420,
  CONFITURE: 180,
  MIEL: 120,
  PALETTE: 80,
};

async function seedStockInitial() {
  try {
    await sequelize.authenticate();

    const company = await Company.findOne();
    if (!company) throw new Error("❌ Company manquante");

    const clrs = await CLR.findAll();
    const produits = await Produit.findAll();

    let created = 0;

    for (const clr of clrs) {
      const region = clr.region;
      const regionFactor = REGION_FILL[region] || 0.5;

      // 🔥 capacité max CLR (conversion palettes → cartons)
      const maxCapacityCartons =
        (PLATEFORM_CAPACITY[region] || 5000) * CARTONS_PER_PALETTE;

      for (const produit of produits) {
        const base = FAMILY_BASE[produit.famille] || 200;
        const familyFactor = FAMILY_MULTIPLIER[produit.famille] || 1;

        // stock théorique
        let stock = base * familyFactor * regionFactor * rand(0.8, 1.2);

        stock = Math.round(stock);

        // 🔥 clamp logique selon capacité régionale
        if (stock > maxCapacityCartons * 0.02) {
          stock = Math.round(maxCapacityCartons * 0.02);
          // max 2% de capacité par produit (réaliste ERP)
        }

        const reserve = Math.round(stock * rand(0.05, 0.15));

        await StockCLR.create({
          produitId: produit.id,
          clrId: clr.id,
          companyId: company.id,
          qteDisponible: stock,
          qteReservee: reserve,
          lastUpdated: new Date(),
        });

        created++;
      }
    }

    console.log(`✅ Stock initial créé : ${created} lignes`);
    console.log("🎉 Seed stock cohérent terminé");

    process.exit(0);
  } catch (err) {
    console.error("❌ Erreur seed stock initial:", err);
    process.exit(1);
  }
}

seedStockInitial();
