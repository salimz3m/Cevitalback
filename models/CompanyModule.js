// models/CompanyModule.js — Sprint 8
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const CompanyModule = sequelize.define(
  "CompanyModule",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    companyId: { type: DataTypes.INTEGER, allowNull: false },

    moduleKey: {
      type: DataTypes.ENUM(
        "PLANIF_INTEL",
        "TRANSPORT_INTEL",
        "STOCK_INTEL",
        "KPI_DASHBOARD",
        "PORTAIL_CLIENT",
        "PORTAIL_PRESTATAIRE",
        "API_PUBLIQUE",
        "EXPORT_PDF"
      ),
      allowNull: false,
    },

    actif: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },

    // Configuration JSON spécifique au module (limites, paramètres, etc.)
    configJson: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const raw = this.getDataValue("configJson");
        try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
      },
      set(val) {
        this.setDataValue("configJson", val ? JSON.stringify(val) : null);
      },
    },
  },
  {
    tableName: "company_modules",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["companyId", "moduleKey"],
        name: "unique_company_module",
      },
    ],
  }
);

module.exports = CompanyModule;
