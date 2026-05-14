// models/LotProduction.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const LotProduction = sequelize.define(
  "LotProduction",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    codeLot: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true,
      comment: "ex: LOT-HUI-FLE-1L-20250507-001",
    },

    produitId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: null,
    },

    plateformeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: null,
      comment: "Plateforme où le lot est produit",
    },

    companyId: { type: DataTypes.INTEGER, allowNull: false },

    qteProduite: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    dateFabrication: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    dateExpiration: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: "Auto-calculé : dateFabrication + produit.delaiPeremptionJours",
    },

    statut: {
      type: DataTypes.ENUM("EN_STOCK", "DISTRIBUE", "EXPIRE", "RETIRE"),
      defaultValue: "EN_STOCK",
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: null,
      comment: "Qui a déclaré le lot",
    },

    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: "lots_production",
    timestamps: true,
    indexes: [
      { fields: ["produitId", "companyId"] },
      { fields: ["statut"] },
      { fields: ["dateExpiration"] },
    ],
  },
);

module.exports = LotProduction;
