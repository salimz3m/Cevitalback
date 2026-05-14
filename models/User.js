const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    // Rôles : 'keep_contact' | 'planification' | 'transport' | 'admin'
    role: {
      type: DataTypes.ENUM(
        "keep_contact",
        "planification",
        "transport",
        "admin",
      ),
      defaultValue: "keep_contact",
    },
    name: { type: DataTypes.STRING },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    invitationToken: { type: DataTypes.STRING, allowNull: true },
    invitationExpiry: { type: DataTypes.DATE, allowNull: true },
    lastLogin: { type: DataTypes.DATE, allowNull: true },
    actif: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  { timestamps: true },
);

module.exports = User;
