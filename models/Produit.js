// models/Produit.js — Sprint 7
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Produit = sequelize.define(
  "Produit",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    sku: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
      comment: "Référence unique ex: HUI-FLE-1L",
    },

    nom: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },

    famille: {
      type: DataTypes.ENUM(
        "HUILE",
        "MARGARINE",
        "SUCRE",
        "SMEN",
        "CHOCOLAT",
        "SAUCE",
        "EAU",
        "MIEL",
        "CONFITURE",
        "BOISSON",
        "PALETTE",
        "AUTRE",
      ),
      allowNull: false,
    },

    marque: {
      type: DataTypes.STRING(60),
      allowNull: true,
      comment:
        "Fleurial, Skor, Matina, Elio, Tchina, Medina, Assila, FOODY'S...",
    },

    // Unité de gestion stock (carton, sac, pack, unité)
    unite: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "carton",
    },

    // Conditionnement — nb d'unités consommateurs par carton
    qteParCarton: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 1,
    },

    // Poids unitaire en kg (par carton/sac)
    poidsKg: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    // Prix unitaire en DZD (pour calcul valeur stock)
    prixUnitaireDZD: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
      comment: "Prix sortie usine en DZD par unité stock",
    },

    // Nb de cartons/sacs par palette (pour calcul chargement)
    qteParPalette: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 50,
    },

    description: { type: DataTypes.TEXT, allowNull: true },

    actif: { type: DataTypes.BOOLEAN, defaultValue: true },
    delaiPeremptionJours: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 365,
      comment: "Pour auto-calcul DLC du lot : dateFab + delaiPeremptionJours",
    },
    aliases: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      defaultValue: [],
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Multi-tenant : produits par company",
    },
  },
  {
    tableName: "produits",
    timestamps: true,
  },
);

module.exports = Produit;
