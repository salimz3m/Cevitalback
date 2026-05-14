// models/MouvementStock.js — Sprint 7
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const MouvementStock = sequelize.define(
  "MouvementStock",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    produitId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: null,
      comment: "FK → produits",
    },

    clrId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: null,
      comment: "FK → clrs (CLR concerné)",
    },

    companyId: { type: DataTypes.INTEGER, allowNull: false },

    type: {
      type: DataTypes.ENUM(
        "ENTREE_LIVRAISON",  // livraison confirmée depuis transport
        "SORTIE_PLANIF",     // réservation lors de création ordre transport
        "LIBERATION_RESA",   // libération si ordre annulé
        "AJUSTEMENT_MANUEL", // correction manuelle (admin)
        "RETOUR",            // retour marchandise
        "PERTE"              // perte/casse déclarée
      ),
      allowNull: false,
    },

    // Positif = entrée en stock, Négatif = sortie/réservation
    quantite: {
      type: DataTypes.FLOAT,
      allowNull: false,
      comment: ">0 = entrée, <0 = sortie",
    },

    // Stock résultant après ce mouvement (snapshot pour audit)
    stockApres: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: "qteDisponible après ce mouvement",
    },

    // Référence à l'entité source du mouvement
    referenceType: {
      type: DataTypes.ENUM("ORDRE_TRANSPORT", "PLANIF_SESSION", "MANUEL", "IMPORT"),
      allowNull: true,
    },

    referenceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "ordreTransportId | planifSessionId selon referenceType",
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Utilisateur à l'origine du mouvement",
    },

    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: "mouvement_stocks",
    timestamps: true,
    updatedAt: false, // journal immuable — pas de mise à jour
  }
);

module.exports = MouvementStock;
