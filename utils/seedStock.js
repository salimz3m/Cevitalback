const { sequelize, Produit, CLR, StockCLR, Company } = require("../models");

async function seedStock() {
  await sequelize.authenticate();

  const company = await Company.findOne();
  if (!company) throw new Error("Company introuvable");

  const produits = await Produit.findAll();
  const clrs = await CLR.findAll();

  console.log(`Produits: ${produits.length}`);
  console.log(`CLR: ${clrs.length}`);

  let count = 0;

  for (const clr of clrs) {
    for (const produit of produits) {
      const qte = Math.floor(Math.random() * 500);

      await StockCLR.create({
        produitId: produit.id,
        clrId: clr.id,
        companyId: company.id,
        qteDisponible: qte,
        qteReservee: Math.floor(qte * 0.1),
      });

      count++;
    }
  }

  console.log(`Stock créé: ${count} lignes`);
  process.exit(0);
}

seedStock();
