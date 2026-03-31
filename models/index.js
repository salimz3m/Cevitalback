const sequelize = require("../config/database");

const Company = require("./Company");
const User = require("./User");
const Order = require("./Order");
const OrderItem = require("./OrderItem");
const Driver = require("./Driver");
const Delivery = require("./Delivery");
const Depot = require("./Depot");
const Stock = require("./Stock");
const AuditLog = require("./AuditLog");

// ─── Associations ──────────────────────────────────────────────
// Company
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

// Order ↔ OrderItems
Order.hasMany(OrderItem, { foreignKey: "orderId", onDelete: "CASCADE" });
OrderItem.belongsTo(Order, { foreignKey: "orderId" });

// Order ↔ Delivery (1-1)
Order.hasOne(Delivery, { foreignKey: "orderId" });
Delivery.belongsTo(Order, { foreignKey: "orderId" });

// Driver ↔ Delivery
Driver.hasMany(Delivery, { foreignKey: "driverId" });
Delivery.belongsTo(Driver, { foreignKey: "driverId" });

// Depot ↔ Delivery
Depot.hasMany(Delivery, { foreignKey: "depotId" });
Delivery.belongsTo(Depot, { foreignKey: "depotId" });

// Stock ↔ Depot
Depot.hasMany(Stock, { foreignKey: "depotId" });
Stock.belongsTo(Depot, { foreignKey: "depotId" });

// ───────────────────────────────────────────────────────────────

module.exports = {
  sequelize,
  Company,
  User,
  Order,
  OrderItem,
  Driver,
  Delivery,
  Depot,
  Stock,
  AuditLog,
};
