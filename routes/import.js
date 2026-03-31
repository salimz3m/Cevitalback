const express = require("express");
const router = express.Router();
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const { Order, OrderItem } = require("../models");
const { authenticate, authorize } = require("../middleware/auth");
const { log } = require("../utils/audit");

// Config multer — stockage en mémoire (pas de fichier sur disque)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".xlsx" && ext !== ".xls") {
      return cb(
        new Error("Seuls les fichiers Excel (.xlsx, .xls) sont acceptés"),
      );
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

/**
 * POST /api/import/excel
 *
 * Format Excel attendu (Keep Contact standard) :
 * Colonne A : Numéro de commande (orderNumber)
 * Colonne B : Date (date)
 * Colonne C : Produit (productName)
 * Colonne D : Quantité (quantity)
 * Colonne E : Unité (unit) — optionnel
 * Colonne F : Prix unitaire (unitPrice) — optionnel
 *
 * La première ligne est considérée comme en-tête et ignorée.
 */
router.post(
  "/excel",
  authenticate,
  authorize("keep_contact", "admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: "Aucun fichier fourni" });

      // Lecture du fichier Excel depuis le buffer mémoire
      const workbook = XLSX.read(req.file.buffer, {
        type: "buffer",
        cellDates: true,
      });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Conversion en JSON — header: 1 = utilise la 1ère ligne comme en-têtes
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

      if (rows.length < 2) {
        return res.status(400).json({
          message: "Le fichier est vide ou ne contient que l'en-tête",
        });
      }

      const headers = rows[0]; // 1ère ligne = en-têtes
      const dataRows = rows
        .slice(1)
        .filter((row) => row.some((cell) => cell !== null));

      // Résultats de l'import
      const results = { created: 0, updated: 0, errors: [] };
      const ordersMap = {}; // grouper les lignes par orderNumber

      // Détection intelligente des colonnes (flexible pour différents templates)
      const colIndex = detectColumns(headers);

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const lineNum = i + 2; // numéro de ligne dans Excel (commence à 2)

        try {
          const orderNumber = String(row[colIndex.orderNumber] || "").trim();
          const date = formatDate(row[colIndex.date]);
          const productName = String(row[colIndex.productName] || "").trim();
          const quantity = parseFloat(row[colIndex.quantity]);

          if (!orderNumber) {
            results.errors.push(
              `Ligne ${lineNum}: numéro de commande manquant`,
            );
            continue;
          }
          if (!date) {
            results.errors.push(`Ligne ${lineNum}: date invalide`);
            continue;
          }
          if (!productName) {
            results.errors.push(`Ligne ${lineNum}: produit manquant`);
            continue;
          }
          if (isNaN(quantity)) {
            results.errors.push(`Ligne ${lineNum}: quantité invalide`);
            continue;
          }

          // Grouper les items par commande
          if (!ordersMap[orderNumber]) {
            ordersMap[orderNumber] = { orderNumber, date, items: [] };
          }
          ordersMap[orderNumber].items.push({
            productName,
            quantity,
            unit:
              colIndex.unit !== null
                ? String(row[colIndex.unit] || "unité")
                : "unité",
            unitPrice:
              colIndex.unitPrice !== null
                ? parseFloat(row[colIndex.unitPrice]) || null
                : null,
          });
        } catch (err) {
          results.errors.push(`Ligne ${lineNum}: ${err.message}`);
        }
      }

      // Insérer ou mettre à jour en base
      for (const [orderNumber, data] of Object.entries(ordersMap)) {
        const [order, created] = await Order.findOrCreate({
          where: { orderNumber, companyId: req.user.companyId },
          defaults: {
            date: data.date,
            companyId: req.user.companyId,
            createdBy: req.user.id,
          },
        });

        if (created) {
          results.created++;
        } else {
          // Supprimer les anciens items avant réimport
          await OrderItem.destroy({ where: { orderId: order.id } });
          results.updated++;
        }

        await OrderItem.bulkCreate(
          data.items.map((item) => ({ ...item, orderId: order.id })),
        );
      }

      await log(req.user.id, "IMPORT_EXCEL", "Order", null, {
        filename: req.file.originalname,
        created: results.created,
        updated: results.updated,
        errors: results.errors.length,
      });

      res.json({
        message: "Import terminé",
        stats: {
          totalOrders: Object.keys(ordersMap).length,
          created: results.created,
          updated: results.updated,
          errors: results.errors.length,
        },
        errors: results.errors,
      });
    } catch (err) {
      res
        .status(500)
        .json({ message: "Erreur lors de l'import", error: err.message });
    }
  },
);

// Détecte les colonnes de manière flexible (nom de colonne ou position)
function detectColumns(headers) {
  const normalize = (s) =>
    String(s || "")
      .toLowerCase()
      .trim();
  const find = (keywords, fallback) => {
    const idx = headers.findIndex((h) =>
      keywords.some((k) => normalize(h).includes(k)),
    );
    return idx !== -1 ? idx : fallback;
  };

  return {
    orderNumber: find(["commande", "order", "numéro", "numero", "n°"], 0),
    date: find(["date"], 1),
    productName: find(["produit", "product", "article", "désignation"], 2),
    quantity: find(["quantité", "quantite", "qty", "qté"], 3),
    unit: find(["unité", "unite", "unit"], 4),
    unitPrice: find(["prix", "price", "tarif"], 5),
  };
}

// Formate une date Excel ou string en YYYY-MM-DD
function formatDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "number") {
    // Date Excel sérialisée en nombre
    const date = XLSX.SSF.parse_date_code(value);
    if (date)
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const parsed = new Date(value);
  if (!isNaN(parsed)) return parsed.toISOString().split("T")[0];
  return null;
}

// GET /api/import/template — télécharger un template Excel vide
router.get("/template", authenticate, (req, res) => {
  const wb = XLSX.utils.book_new();
  const headers = [
    ["N° Commande", "Date", "Produit", "Quantité", "Unité", "Prix Unitaire"],
  ];
  const example = [
    ["CMD-001", "2024-01-15", "Huile végétale", 100, "cartons", 250],
  ];
  const ws = XLSX.utils.aoa_to_sheet([...headers, ...example]);
  XLSX.utils.book_append_sheet(wb, ws, "Commandes");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=template_commandes.xlsx",
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.send(buffer);
});

module.exports = router;
