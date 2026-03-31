const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

// Table manquante dans le plan initial, essentielle pour le comparateur Stock vs Commandé (CDC §5.2)
const Stock = sequelize.define(
  "Stock",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productName: { type: DataTypes.STRING, allowNull: false },
    availableQty: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    unit: { type: DataTypes.STRING, defaultValue: "unité" },
    depotId: { type: DataTypes.INTEGER, allowNull: true },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    lastUpdated: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { timestamps: true },
);

module.exports = Stock;
