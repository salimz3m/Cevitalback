/**
 * utils/seedStockCLR.js — Sprint 7
 * Initialise stock_clrs à 0 pour chaque combinaison produit × CLR
 * Usage : node utils/seedStockCLR.js
 */

const { sequelize, Produit, CLR, StockCLR, Company } = require("../models");

async function seedStockCLR() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connexion DB OK");

    const company = await Company.findOne();
    if (!company) {
      throw new Error("Aucune Company trouvée en base.");
    }
    const companyId = company.id;

    const produits = await Produit.findAll({ where: { actif: true } });
    const clrs = await CLR.findAll({ where: { actif: true } });

    console.log(`📦 ${produits.length} produits actifs`);
    console.log(`🏭 ${clrs.length} CLR actifs`);

    let created = 0;
    let skipped = 0;

    for (const produit of produits) {
      for (const clr of clrs) {
        const [, wasCreated] = await StockCLR.findOrCreate({
          where: { produitId: produit.id, clrId: clr.id },
          defaults: {
            produitId: produit.id,
            clrId: clr.id,
            companyId,
            quantite: 0,
            dateMAJ: new Date(),
          },
        });

        if (wasCreated) {
          created++;
        } else {
          skipped++;
        }
      }
    }

    console.log(`✅ StockCLR : ${created} créés, ${skipped} déjà existants`);
    console.log(
      `🎉 Seed stock CLR terminé ! (${produits.length} × ${clrs.length} = ${produits.length * clrs.length} entrées attendues)`,
    );

    process.exit(0);
  } catch (err) {
    console.error("❌ Erreur seed:", err);
    process.exit(1);
  }
}

seedStockCLR();
