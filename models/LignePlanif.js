// models/LignePlanif.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const LignePlanif = sequelize.define(
  "LignePlanif",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sessionId: { type: DataTypes.INTEGER, allowNull: false },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    diapason: {
      type: DataTypes.STRING(2),
      allowNull: false,
      validate: {
        isIn: [["D1", "D2"]],
      },
    },
    plateformeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "obligatoire si diapason=D1, null si D2",
    },
    clrId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "CLR de destination",
    },
    statut: {
      type: DataTypes.STRING(25),
      defaultValue: "PLANIFIEE",
      validate: {
        isIn: [["PLANIFIEE", "ENVOYEE_TRANSPORT", "LIVREE"]],
      },
    },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: "ligne_planifs",
    timestamps: true,
  },
);

module.exports = LignePlanif;
