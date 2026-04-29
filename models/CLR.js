// models/CLR.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const CLR = sequelize.define(
  "CLR",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
    nom: { type: DataTypes.STRING, allowNull: false },
    wilaya: { type: DataTypes.STRING, allowNull: false },
    region: {
      type: DataTypes.ENUM("EST", "CENTRE", "OUEST"),
      allowNull: false,
    },
    plateformeId: { type: DataTypes.INTEGER, allowNull: true },
    adresse: { type: DataTypes.STRING, allowNull: true },
    actif: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    tableName: "clrs",
    timestamps: true,
  },
);

module.exports = CLR;
