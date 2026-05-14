const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Order = sequelize.define(
  "Order",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.ENUM(
        "pending",
        "planned",
        "in_transit",
        "delivered",
        "cancelled",
      ),
      defaultValue: "pending",
    },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    createdBy: { type: DataTypes.INTEGER },
    lockedBy: { type: DataTypes.INTEGER, allowNull: true },
    lockedAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT },

    // ── Sprint 10 ──
    source: {
      type: DataTypes.ENUM("EXCEL", "MANUELLE", "API"),
      defaultValue: "EXCEL",
    },
    codeCommande: { type: DataTypes.STRING(80), allowNull: true },
    codeClient: { type: DataTypes.STRING(80), allowNull: true },
    famille: { type: DataTypes.STRING(80), allowNull: true },
    clrCode: { type: DataTypes.STRING(80), allowNull: true },
  },
  { timestamps: true },
);

module.exports = Order;
