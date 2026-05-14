// models/StockCLR.js — Sprint 7
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const StockCLR = sequelize.define(
  "StockCLR",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    produitId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: null, // FK gérée manuellement
      comment: "FK → produits",
    },

    clrId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: null, // FK gérée manuellement
      comment: "FK → clrs",
    },

    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    // Quantité physiquement présente au CLR (après livraisons confirmées)
    qteDisponible: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      comment: "Stock physique confirmé (livraisons LIVRE)",
    },

    // Quantité réservée = en transit vers ce CLR
    qteReservee: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      comment: "Stock en transit (ordres EN_ROUTE ou CREE)",
    },

    // Calculé : disponible + réservé (stock total attendu)
    // → qtéPhysique = qteDisponible (ce qui est là)
    // → qtéAttendue = qteDisponible + qteReservee

    lastUpdated: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "stock_clrs",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["produitId", "clrId", "companyId"],
        name: "unique_stock_produit_clr",
      },
    ],
  }
);

module.exports = StockCLR;
