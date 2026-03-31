const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Order = sequelize.define(
  "Order",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    // Statuts : 'pending' | 'planned' | 'in_transit' | 'delivered' | 'cancelled'
    status: {
      type: DataTypes.ENUM(
        "pending",
        "planned",
        "in_transit",
        "delivered",
        "cancelled",
      ),
      defaultValue: "pending",
    },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    createdBy: { type: DataTypes.INTEGER }, // userId
    // Verrouillage concurrent (Phase 2 CDC)
    lockedBy: { type: DataTypes.INTEGER, allowNull: true }, // userId qui a le verrou
    lockedAt: { type: DataTypes.DATE, allowNull: true }, // timestamp du verrou
    notes: { type: DataTypes.TEXT },
  },
  { timestamps: true },
);

module.exports = Order;
