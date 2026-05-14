// models/SeuilAlerte.js — Sprint 7
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const SeuilAlerte = sequelize.define(
  "SeuilAlerte",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    produitId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: null,
      comment: "FK → produits",
    },

    // null = seuil global pour tous les CLR
    clrId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: null,
      comment: "FK → clrs (null = tous CLR)",
    },

    companyId: { type: DataTypes.INTEGER, allowNull: false },

    // En dessous → alerte rouge (rupture imminente)
    seuilMinimum: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 10,
      comment: "Quantité minimale avant alerte rouge",
    },

    // Niveau cible après réapprovisionnement
    seuilOptimal: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 100,
      comment: "Quantité cible / niveau de confort",
    },

    // Entre minimum et optimal → alerte orange
    seuilWarning: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: "Si null, calculé automatiquement = (min + optimal) / 2",
    },

    actif: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    tableName: "seuil_alertes",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["produitId", "clrId", "companyId"],
        name: "unique_seuil_produit_clr",
      },
    ],
  }
);

module.exports = SeuilAlerte;
