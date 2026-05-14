const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const OrderItem = sequelize.define(
  "OrderItem",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    productName: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.FLOAT, allowNull: false },
    unitPrice: { type: DataTypes.FLOAT },
    unit: { type: DataTypes.STRING, defaultValue: "unité" },

    // ── Sprint 10 ──
    sku: { type: DataTypes.STRING(80), allowNull: true },
    conditionnement: { type: DataTypes.STRING(80), allowNull: true },
    quantitePLT: { type: DataTypes.FLOAT, allowNull: true },
    netAPayer: { type: DataTypes.FLOAT, allowNull: true },
    produitId: { type: DataTypes.INTEGER, allowNull: true },
  },
  { timestamps: true },
);

module.exports = OrderItem;
