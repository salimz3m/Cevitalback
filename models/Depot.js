const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Depot = sequelize.define(
  "Depot",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    // type : 'PLATEFORME' | 'CLR' | 'DEPOT'
    type: {
      type: DataTypes.ENUM("PLATEFORME", "CLR", "DEPOT"),
      allowNull: false,
    },
    location: { type: DataTypes.STRING },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
  },
  { timestamps: true },
);

module.exports = Depot;
