const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Delivery = sequelize.define(
  "Delivery",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    deliveryDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.ENUM("scheduled", "in_transit", "delivered", "failed"),
      defaultValue: "scheduled",
    },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    driverId: { type: DataTypes.INTEGER, allowNull: true },
    depotId: { type: DataTypes.INTEGER, allowNull: true },
    notes: { type: DataTypes.TEXT },
    assignedBy: { type: DataTypes.INTEGER }, // userId (équipe Transport)
  },
  { timestamps: true },
);

module.exports = Delivery;
