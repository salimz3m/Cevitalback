// models/DemandeCommande.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DemandeCommande = sequelize.define('DemandeCommande', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'User client qui passe la commande',
    },

    codeClient: {
      type: DataTypes.STRING(80),
      allowNull: true,
      comment: 'Code KeepContact pour liaison automatique',
    },

    companyId: { type: DataTypes.INTEGER, allowNull: false },

    statut: {
      type: DataTypes.ENUM('EN_ATTENTE', 'VALIDEE', 'REJETEE', 'PLANIFIEE'),
      defaultValue: 'EN_ATTENTE',
    },

    // Lignes de commande : [{ produit, famille, quantite, unite, commentaire }]
    lignes: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },

    commentaire: { type: DataTypes.TEXT, allowNull: true },

    dateCreation: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    dateTraitement: { type: DataTypes.DATE, allowNull: true },
    traitePar: { type: DataTypes.INTEGER, allowNull: true },

    // Lien vers Order créé après validation commerciale
    orderId: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'demande_commandes',
    timestamps: true,
  });

  DemandeCommande.associate = (models) => {
    DemandeCommande.belongsTo(models.User, { foreignKey: 'userId', as: 'clientUser' });
    DemandeCommande.belongsTo(models.User, { foreignKey: 'traitePar', as: 'traiteurUser' });
    if (models.Order) {
      DemandeCommande.belongsTo(models.Order, { foreignKey: 'orderId', as: 'order' });
    }
  };

  return DemandeCommande;
};
