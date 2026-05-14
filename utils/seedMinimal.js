const { sequelize, Company, Produit, CLR, StockCLR } = require("../models");

async function seed() {
  await sequelize.authenticate();

  const company = await Company.findOne();

  if (!company) throw new Error("Company manquante");

  const clrs = await CLR.findAll();

  // 5 produits simples
  const produits = await Produit.bulkCreate([
    {
      sku: "HUI-001",
      nom: "Huile 5L",
      famille: "HUILE",
      unite: "carton",
      companyId: company.id,
    },
    {
      sku: "SUG-001",
      nom: "Sucre 1kg",
      famille: "SUCRE",
      unite: "carton",
      companyId: company.id,
    },
    {
      sku: "EAU-001",
      nom: "Eau 1.5L",
      famille: "BOISSON",
      unite: "carton",
      companyId: company.id,
    },
  ]);

  // stock minimal
  for (const clr of clrs) {
    for (const p of produits) {
      await StockCLR.create({
        produitId: p.id,
        clrId: clr.id,
        companyId: company.id,
        qteDisponible: Math.floor(Math.random() * 500),
        qteReservee: 0,
      });
    }
  }

  console.log("DONE SEED MINIMAL");
  process.exit(0);
}

seed();