// models/Plateforme.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Plateforme = sequelize.define(
  "Plateforme",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nom: { type: DataTypes.STRING, allowNull: false },
    region: {
      type: DataTypes.ENUM("EST", "CENTRE", "OUEST"),
      allowNull: false,
    },
    ville: { type: DataTypes.STRING, allowNull: false },
    capacite: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "capacité en palettes",
    },
    actif: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    tableName: "plateformes",
    timestamps: true,
  },
);

module.exports = Plateforme;
