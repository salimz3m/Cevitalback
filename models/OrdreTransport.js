// models/OrdreTransport.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const OrdreTransport = sequelize.define(
  "OrdreTransport",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // Référence à la session de planification dont sont issues les lignes
    sessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: null, // ← Sequelize ne crée PLUS de FK automatique

      comment: "FK → PlanifSession",
    },

    // Lignes de planification incluses dans cet ordre (tableau d'IDs JSON)
    lignesPlanifIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: "Array of LignePlanif IDs regroupées dans cet ordre",
    },

    // Informations transporteur
    prestataire: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Nom de la société de transport",
    },
    vehicule: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Immatriculation ou description du véhicule",
    },
    capaciteChargee: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: "Quantité totale chargée (palettes ou unités)",
    },

    // Statut workflow
    statut: {
      type: DataTypes.ENUM("CREE", "EN_ROUTE", "LIVRE", "INCIDENT"),
      defaultValue: "CREE",
      allowNull: false,
    },

    // Dates
    dateDepart: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    dateArriveePrevue: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    dateLivraisonReelle: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Renseigné lors de la confirmation de livraison",
    },

    // CLR de destination (déduit des lignes — stocké pour commodité)
    clrId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: null, // ← Sequelize ne crée PLUS de FK automatique

      comment: "CLR de destination final (FK → Depot type=CLR)",
    },

    companyId: { type: DataTypes.INTEGER, allowNull: false },

    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: "ordre_transports",
    timestamps: true,
  },
);

module.exports = OrdreTransport;
