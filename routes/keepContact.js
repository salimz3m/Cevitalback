// routes/keepContact.js — Sprint 10
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authenticate, authorize } = require("../middleware/auth");
const { importExcel, createManuelle } = require("../services/keepContact");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const CAN_IMPORT = ["admin", "planificateur", "gestionnaire_stock"];

// POST /keep-contact/import — import Excel
router.post(
  "/import",
  authenticate,
  authorize(...CAN_IMPORT),
  upload.single("file"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ message: "Aucun fichier reçu" });
    try {
      const result = await importExcel(
        req.file.buffer,
        req.user.companyId,
        req.user.id,
      );
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message });
    }
  },
);

// POST /keep-contact/commande-manuelle
router.post(
  "/commande-manuelle",
  authenticate,
  authorize(...CAN_IMPORT),
  async (req, res) => {
    try {
      const order = await createManuelle(
        req.body,
        req.user.companyId,
        req.user.id,
      );
      res.status(201).json(order);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  },
);

module.exports = router;
