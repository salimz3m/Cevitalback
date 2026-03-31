const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

// Traçabilité complète des actions (CDC §3.2.B)
const AuditLog = sequelize.define(
  "AuditLog",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER },
    action: { type: DataTypes.STRING, allowNull: false }, // ex: 'CREATE_ORDER', 'IMPORT_EXCEL'
    tableName: { type: DataTypes.STRING },
    recordId: { type: DataTypes.INTEGER },
    details: { type: DataTypes.JSONB }, // données avant/après modification
  },
  { timestamps: true, updatedAt: false },
);

module.exports = AuditLog;
