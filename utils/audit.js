const { AuditLog } = require("../models");

/**
 * Enregistre une action dans l'AuditLog
 * @param {number} userId
 * @param {string} action  - ex: 'CREATE_ORDER', 'IMPORT_EXCEL', 'ASSIGN_DRIVER'
 * @param {string} tableName
 * @param {number} recordId
 * @param {object} details - données supplémentaires (avant/après)
 */
const log = async (
  userId,
  action,
  tableName = null,
  recordId = null,
  details = {},
) => {
  try {
    await AuditLog.create({ userId, action, tableName, recordId, details });
  } catch (err) {
    console.error("AuditLog error:", err.message);
  }
};

module.exports = { log };
