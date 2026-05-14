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
        isIn: [["D1", "D2", "D3", "D4", "D5"]],
      },
      comment:
        "D1=PLF→CLR | D2=Usine→CLR | D3=CLR→CLR | D4=Usine→PLF | D5=Retour CLR→PLF",
    },

    plateformeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Obligatoire si D1/D4/D5, null si D2/D3",
    },

    clrId: {
      type: DataTypes.INTEGER,
      allowNull: true, // nullable pour D4 (destination = plateforme)
      comment: "CLR destination — null si D4",
    },

    // NOUVEAU — source pour D3 et D5
    clrSourceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: null,
      comment: "CLR expéditeur — obligatoire si D3 ou D5, null sinon",
    },
    itemsJson: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Articles sélectionnés avec quantités planifiées",
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
