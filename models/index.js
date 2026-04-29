// models/index.js — Sprint 2 (PlanifSession + LignePlanif ajoutés)
const sequelize = require("../config/database");

// ── Modèles existants ─────────────────────────────────────────
const Company = require("./Company");
const User = require("./User");
const Order = require("./Order");
const OrderItem = require("./OrderItem");
const Stock = require("./Stock");
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
// ── Sprint 3──────────────────────────────────────────────────

const OrdreTransport = require("./OrdreTransport");
const SuiviTransport = require("./SuiviTransport");
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

Order.hasMany(OrderItem, { foreignKey: "orderId", onDelete: "CASCADE" });
OrderItem.belongsTo(Order, { foreignKey: "orderId" });

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

// ═════════════════════════════════════════════════════════════
// ASSOCIATIONS SPRINT 1
// ═════════════════════════════════════════════════════════════
Plateforme.hasMany(CLR, { foreignKey: "plateformeId", as: "clrs" });
CLR.belongsTo(Plateforme, { foreignKey: "plateformeId", as: "plateforme" });

// ═════════════════════════════════════════════════════════════
// ASSOCIATIONS SPRINT 2
// ═════════════════════════════════════════════════════════════

// PlanifSession ↔ Company / User
Company.hasMany(PlanifSession, { foreignKey: "companyId" });
PlanifSession.belongsTo(Company, { foreignKey: "companyId" });

User.hasMany(PlanifSession, { foreignKey: "createurId", as: "sessionsCreees" });
PlanifSession.belongsTo(User, { foreignKey: "createurId", as: "createur" });

// PlanifSession ↔ LignePlanif
PlanifSession.hasMany(LignePlanif, {
  foreignKey: "sessionId",
  as: "lignes",
  onDelete: "CASCADE",
});
LignePlanif.belongsTo(PlanifSession, {
  foreignKey: "sessionId",
  as: "session",
});

// LignePlanif ↔ Order
Order.hasMany(LignePlanif, { foreignKey: "orderId", as: "lignesPlanif" });
LignePlanif.belongsTo(Order, { foreignKey: "orderId", as: "order" });

// LignePlanif ↔ Plateforme (nullable pour D2)
Plateforme.hasMany(LignePlanif, { foreignKey: "plateformeId", as: "lignes" });
LignePlanif.belongsTo(Plateforme, {
  foreignKey: "plateformeId",
  as: "plateforme",
});

// LignePlanif ↔ CLR
CLR.hasMany(LignePlanif, { foreignKey: "clrId", as: "lignes" });
LignePlanif.belongsTo(CLR, { foreignKey: "clrId", as: "clr" });
// ═════════════════════════════════════════════════════════════
// ASSOCIATIONS SPRINT 3
// ═════════════════════════════════════════════════════════════
// Associations OrdreTransport ↔ SuiviTransport
OrdreTransport.hasMany(SuiviTransport, { foreignKey: "ordreId", as: "suivis" });
SuiviTransport.belongsTo(OrdreTransport, {
  foreignKey: "ordreId",
  as: "ordre",
});

// Association OrdreTransport ↔ PlanifSession (lecture)
OrdreTransport.belongsTo(PlanifSession, {
  foreignKey: "sessionId",
  as: "session",
});
PlanifSession.hasMany(OrdreTransport, {
  foreignKey: "sessionId",
  as: "ordres",
});

// Association OrdreTransport ↔ Depot (CLR destination)
OrdreTransport.belongsTo(CLR, { foreignKey: "clrId", as: "clr" }); // ═════════════════════════════════════════════════════════════
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
};
