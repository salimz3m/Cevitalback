const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Client = sequelize.define(
  "Client",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    codeClient: {
      type: DataTypes.STRING(80),
      allowNull: false,
      comment: "Code issu de l'import Excel Keep Contact",
    },

    companyId: { type: DataTypes.INTEGER, allowNull: false },

    nom: { type: DataTypes.STRING(150), allowNull: true },

    clrCode: {
      type: DataTypes.STRING(80),
      allowNull: true,
      comment: "Code CLR de rattachement (depuis Excel)",
    },

    clrId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "FK CLR résolu automatiquement depuis clrCode",
    },

    contact: { type: DataTypes.STRING(150), allowNull: true },
    telephone: { type: DataTypes.STRING(40), allowNull: true },
    adresse: { type: DataTypes.TEXT, allowNull: true },
    actif: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    tableName: "clients",
    timestamps: true,
    indexes: [{ unique: true, fields: ["codeClient", "companyId"] }],
  },
);

module.exports = Client;
