// models/PlanifSession.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PlanifSession = sequelize.define("PlanifSession", {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  date:        { type: DataTypes.DATEONLY, allowNull: false, comment: "date de livraison cible J+1" },
  statut:      {
    type: DataTypes.ENUM("BROUILLON", "VALIDEE", "ENVOYEE"),
    defaultValue: "BROUILLON",
  },
  companyId:   { type: DataTypes.INTEGER, allowNull: false },
  createurId:  { type: DataTypes.INTEGER, allowNull: false, comment: "userId du planificateur" },
  notes:       { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: "planif_sessions",
  timestamps: true,
});

module.exports = PlanifSession;
