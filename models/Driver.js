const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Driver = sequelize.define(
  "Driver",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },
    licenseNumber: { type: DataTypes.STRING },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
  },
  { timestamps: true },
);

module.exports = Driver;
