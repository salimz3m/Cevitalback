// models/index.js — mis à jour Sprint 7 + Sprint 8
// ⚠️  REMPLACER l'intégralité de votre models/index.js par ce fichier

const sequelize = require("../config/database");

// ── Modèles existants ─────────────────────────────────────────
const Company = require("./Company");
const User = require("./User");
const Order = require("./Order");
const OrderItem = require("./OrderItem");
const Stock = require("./Stock"); // legacy — conservé pour compatibilité
const Depot = require("./Depot");
const Driver = require("./Driver");
const Delivery = require("./Delivery");
const AuditLog = require("./AuditLog");

// ── Sprint 1 ──────────────────────────────────────────────────
const Plateforme = require("./Plateforme");
const CLR = require("./CLR");

// ── Sprint 2 ──────────────────────────────────────────────────
const PlanifSession = require("./PlanifSession");
const LignePlanif = require("./LignePlanif");

// ── Sprint 3 ──────────────────────────────────────────────────
const OrdreTransport = require("./OrdreTransport");
const SuiviTransport = require("./SuiviTransport");

// ── Sprint 7 ──────────────────────────────────────────────────
const Produit = require("./Produit");
const StockCLR = require("./StockCLR");
const MouvementStock = require("./MouvementStock");
const SeuilAlerte = require("./SeuilAlerte");

// ── Sprint 8 ──────────────────────────────────────────────────
const CompanyModule = require("./CompanyModule");

const LotProduction = require("./LotProduction");

const Client = require("./Client");

// ═════════════════════════════════════════════════════════════
// ASSOCIATIONS EXISTANTES (inchangées)
// ═════════════════════════════════════════════════════════════
Company.hasMany(User, { foreignKey: "companyId" });
Company.hasMany(Order, { foreignKey: "companyId" });
Company.hasMany(Driver, { foreignKey: "companyId" });
Company.hasMany(Depot, { foreignKey: "companyId" });
Company.hasMany(Stock, { foreignKey: "companyId" });

User.belongsTo(Company, { foreignKey: "companyId" });
Order.belongsTo(Company, { foreignKey: "companyId" });
Driver.belongsTo(Company, { foreignKey: "companyId" });
Depot.belongsTo(Company, { foreignKey: "companyId" });
Stock.belongsTo(Company, { foreignKey: "companyId" });

// Relation Order ↔ OrderItem
Order.hasMany(OrderItem, {
  foreignKey: "orderId",
  as: "OrderItems",
  onDelete: "CASCADE",
});
OrderItem.belongsTo(Order, { foreignKey: "orderId" });

// Relation OrderItem ↔ Produit
OrderItem.belongsTo(Produit, {
  as: "produit",
  foreignKey: "produitId",
  constraints: false, // utile si la FK n’est pas strictement définie en DB
});

// (optionnel) si tu veux naviguer dans l’autre sens :
Produit.hasMany(OrderItem, {
  as: "OrderItems",
  foreignKey: "produitId",
});

Order.hasOne(Delivery, { foreignKey: "orderId" });
Delivery.belongsTo(Order, { foreignKey: "orderId" });

Driver.hasMany(Delivery, { foreignKey: "driverId" });
Delivery.belongsTo(Driver, { foreignKey: "driverId" });

Depot.hasMany(Delivery, { foreignKey: "depotId" });
Delivery.belongsTo(Depot, { foreignKey: "depotId" });

Depot.hasMany(Stock, { foreignKey: "depotId" });
Stock.belongsTo(Depot, { foreignKey: "depotId" });

AuditLog.belongsTo(User, { foreignKey: "userId" });
User.hasMany(AuditLog, { foreignKey: "userId" });

// ── Sprint 1 ──────────────────────────────────────────────────
Plateforme.hasMany(CLR, { foreignKey: "plateformeId", as: "clrs" });
CLR.belongsTo(Plateforme, { foreignKey: "plateformeId", as: "plateforme" });

// ── Sprint 2 ──────────────────────────────────────────────────
Company.hasMany(PlanifSession, { foreignKey: "companyId" });
PlanifSession.belongsTo(Company, { foreignKey: "companyId" });

User.hasMany(PlanifSession, { foreignKey: "createurId", as: "sessionsCreees" });
PlanifSession.belongsTo(User, { foreignKey: "createurId", as: "createur" });

PlanifSession.hasMany(LignePlanif, {
  foreignKey: "sessionId",
  as: "lignes",
  onDelete: "CASCADE",
});
LignePlanif.belongsTo(PlanifSession, {
  foreignKey: "sessionId",
  as: "session",
});

Order.hasMany(LignePlanif, { foreignKey: "orderId", as: "lignesPlanif" });
LignePlanif.belongsTo(Order, { foreignKey: "orderId", as: "order" });

Plateforme.hasMany(LignePlanif, { foreignKey: "plateformeId", as: "lignes" });
LignePlanif.belongsTo(Plateforme, {
  foreignKey: "plateformeId",
  as: "plateforme",
});

CLR.hasMany(LignePlanif, { foreignKey: "clrId", as: "lignes" });
LignePlanif.belongsTo(CLR, { foreignKey: "clrId", as: "clr" });

// ── Sprint 3 ──────────────────────────────────────────────────
OrdreTransport.hasMany(SuiviTransport, { foreignKey: "ordreId", as: "suivis" });
SuiviTransport.belongsTo(OrdreTransport, {
  foreignKey: "ordreId",
  as: "ordre",
});

OrdreTransport.belongsTo(PlanifSession, {
  foreignKey: "sessionId",
  as: "session",
});
PlanifSession.hasMany(OrdreTransport, {
  foreignKey: "sessionId",
  as: "ordres",
});

OrdreTransport.belongsTo(CLR, { foreignKey: "clrId", as: "clr" });

// ── Sprint 7 ──────────────────────────────────────────────────

// Produit ↔ Company
Company.hasMany(Produit, { foreignKey: "companyId", as: "produits" });
Produit.belongsTo(Company, { foreignKey: "companyId" });

// StockCLR ↔ Produit
Produit.hasMany(StockCLR, { foreignKey: "produitId", as: "stocksCLR" });
StockCLR.belongsTo(Produit, { foreignKey: "produitId", as: "produit" });

// StockCLR ↔ CLR
CLR.hasMany(StockCLR, { foreignKey: "clrId", as: "stocks" });
StockCLR.belongsTo(CLR, { foreignKey: "clrId", as: "clr" });

// StockCLR ↔ Company
Company.hasMany(StockCLR, { foreignKey: "companyId" });
StockCLR.belongsTo(Company, { foreignKey: "companyId" });

// MouvementStock ↔ Produit
Produit.hasMany(MouvementStock, { foreignKey: "produitId", as: "mouvements" });
MouvementStock.belongsTo(Produit, { foreignKey: "produitId", as: "produit" });

// MouvementStock ↔ CLR
CLR.hasMany(MouvementStock, { foreignKey: "clrId", as: "mouvements" });
MouvementStock.belongsTo(CLR, { foreignKey: "clrId", as: "clr" });

// MouvementStock ↔ User
User.hasMany(MouvementStock, { foreignKey: "userId", as: "mouvements" });
MouvementStock.belongsTo(User, { foreignKey: "userId", as: "user" });

// SeuilAlerte ↔ Produit
Produit.hasMany(SeuilAlerte, { foreignKey: "produitId", as: "seuils" });
SeuilAlerte.belongsTo(Produit, { foreignKey: "produitId", as: "produit" });

// SeuilAlerte ↔ CLR (nullable)
CLR.hasMany(SeuilAlerte, { foreignKey: "clrId", as: "seuils" });
SeuilAlerte.belongsTo(CLR, { foreignKey: "clrId", as: "clr" });

// ── Sprint 8 ──────────────────────────────────────────────────
Company.hasMany(CompanyModule, { foreignKey: "companyId", as: "modules" });
CompanyModule.belongsTo(Company, { foreignKey: "companyId" });

// ── Associations Sprint 9 — ajouter avant le module.exports ──

// LignePlanif ↔ CLR source (D3/D5)
CLR.hasMany(LignePlanif, { foreignKey: "clrSourceId", as: "lignesSource" });
LignePlanif.belongsTo(CLR, { foreignKey: "clrSourceId", as: "clrSource" });

// LotProduction ↔ Produit
Produit.hasMany(LotProduction, { foreignKey: "produitId", as: "lots" });
LotProduction.belongsTo(Produit, { foreignKey: "produitId", as: "produit" });

// LotProduction ↔ Plateforme
Plateforme.hasMany(LotProduction, { foreignKey: "plateformeId", as: "lots" });
LotProduction.belongsTo(Plateforme, {
  foreignKey: "plateformeId",
  as: "plateforme",
});

// LotProduction ↔ User
User.hasMany(LotProduction, { foreignKey: "userId", as: "lotsDeclares" });
LotProduction.belongsTo(User, { foreignKey: "userId", as: "declarePar" });

// LotProduction ↔ Company
Company.hasMany(LotProduction, { foreignKey: "companyId", as: "lots" });
LotProduction.belongsTo(Company, { foreignKey: "companyId" });
// Associations — avant module.exports
CLR.hasMany(Client, { foreignKey: "clrId", as: "clients" });
Client.belongsTo(CLR, { foreignKey: "clrId", as: "clr" });
Company.hasMany(Client, { foreignKey: "companyId", as: "clients" });
Client.belongsTo(Company, { foreignKey: "companyId" });

// ═════════════════════════════════════════════════════════════
// EXPORT
// ═════════════════════════════════════════════════════════════
module.exports = {
  sequelize,
  // Existants
  Company,
  User,
  Order,
  OrderItem,
  Stock,
  Depot,
  Driver,
  Delivery,
  AuditLog,
  // Sprint 1
  Plateforme,
  CLR,
  // Sprint 2
  PlanifSession,
  LignePlanif,
  // Sprint 3
  OrdreTransport,
  SuiviTransport,
  // Sprint 7
  Produit,
  StockCLR,
  MouvementStock,
  SeuilAlerte,
  // Sprint 8
  CompanyModule,
  LotProduction,
  Client,
};
