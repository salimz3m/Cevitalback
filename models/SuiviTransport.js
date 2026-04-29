// models/SuiviTransport.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const SuiviTransport = sequelize.define(
  "SuiviTransport",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    ordreId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "FK → OrdreTransport",
    },

    statut: {
      type: DataTypes.ENUM("CREE", "EN_ROUTE", "LIVRE", "INCIDENT"),
      allowNull: false,
    },

    position: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Localisation géographique libre (ville, route...)",
    },

    commentaire: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "userId qui a créé cet événement de suivi",
    },
  },
  {
    tableName: "suivi_transports",
    timestamps: true, // createdAt = timestamp de l'événement
    updatedAt: false,
  }
);

module.exports = SuiviTransport;
