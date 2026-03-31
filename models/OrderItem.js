const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const OrderItem = sequelize.define(
  "OrderItem",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productName: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.FLOAT, allowNull: false },
    unitPrice: { type: DataTypes.FLOAT },
    unit: { type: DataTypes.STRING, defaultValue: "unité" }, // ex: tonnes, cartons
    orderId: { type: DataTypes.INTEGER, allowNull: false },
  },
  { timestamps: true },
);

module.exports = OrderItem;
