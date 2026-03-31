const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Company = sequelize.define(
  "Company",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
  },
  { timestamps: true },
);

module.exports = Company;
