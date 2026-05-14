// services/keepContact.js — Sprint 10
const XLSX = require("xlsx");
const { Op } = require("sequelize");
const { Order, OrderItem, Produit } = require("../models");

// ── Colonnes attendues (vrai format CLR) ───────────────────────────────────
const COLONNES = [
  { key: "clrCode", label: "Code", required: true },
  { key: "codeClient", label: "CodeClient", required: true },
  { key: "codeCommande", label: "Code Commande", required: true },
  { key: "date", label: "Date commande", required: true },
  { key: "famille", label: "Famille", required: false },
  { key: "sku", label: "Code Article", required: true },
  { key: "productName", label: "Designation Produit", required: true },
  { key: "conditionnement", label: "Conditionnement", required: false },
  { key: "quantity", label: "Quantité", required: true },
  { key: "quantitePLT", label: "Quantité PLT", required: false },
  { key: "netAPayer", label: "Net à payer", required: false },
];

// ── Normalise un header Excel (retire accents, espaces, casse) ──────────────
function norm(str) {
  return String(str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const NORM_MAP = {
  code: "clrCode",
  codeclient: "codeClient",
  codecommande: "codeCommande",
  datecommande: "date",
  famille: "famille",
  codearticle: "sku",
  designationproduit: "productName",
  conditionnement: "conditionnement",
  quantite: "quantity",
  quantiteplt: "quantitePLT",
  netapayer: "netAPayer",
};

// ── Parse le buffer Excel → { rows, headerErrors } ────────────────────────
function parseBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  if (raw.length < 2) return { rows: [], headerErrors: ["Fichier vide"] };

  // Mapper les headers
  const headers = raw[0].map((h) => norm(h));
  const mapping = {}; // colIndex → fieldKey
  headers.forEach((h, i) => {
    if (NORM_MAP[h]) mapping[i] = NORM_MAP[h];
  });

  // Vérifier colonnes obligatoires présentes
  const presentFields = Object.values(mapping);
  const headerErrors = COLONNES.filter(
    (c) => c.required && !presentFields.includes(c.key),
  ).map((c) => `Colonne manquante : "${c.label}"`);

  const rows = raw.slice(1).map((row, idx) => {
    const obj = { _rowNum: idx + 2 }; // numéro ligne Excel (1-based + header)
    Object.entries(mapping).forEach(([colIdx, field]) => {
      obj[field] = row[colIdx];
    });
    return obj;
  });

  return { rows, headerErrors };
}

// ── Valider une ligne ─────────────────────────────────────────────────────
function validateRow(row) {
  const errors = [];

  if (!row.codeCommande) errors.push("Code Commande manquant");
  if (!row.codeClient) errors.push("CodeClient manquant");
  if (!row.sku && !row.productName)
    errors.push("Code Article et Désignation manquants");

  const qty = parseFloat(row.quantity);
  if (isNaN(qty) || qty <= 0)
    errors.push(`Quantité invalide : "${row.quantity}"`);

  // Date
  let parsedDate = null;
  if (row.date instanceof Date) {
    parsedDate = row.date.toISOString().slice(0, 10);
  } else if (row.date) {
    const d = new Date(row.date);
    if (!isNaN(d)) parsedDate = d.toISOString().slice(0, 10);
    else errors.push(`Date invalide : "${row.date}"`);
  } else {
    errors.push("Date commande manquante");
  }

  return { errors, parsedDate, qty };
}

// ── Import principal ───────────────────────────────────────────────────────
async function importExcel(buffer, companyId, userId) {
  const { rows, headerErrors } = parseBuffer(buffer);

  if (headerErrors.length > 0) {
    return {
      ok: false,
      headerErrors,
      rapport: [],
      stats: { total: 0, created: 0, updated: 0, errors: 0, doublons: 0 },
    };
  }

  // Grouper par codeCommande (une commande = plusieurs lignes article)
  const grouped = {};
  const rapport = [];

  for (const row of rows) {
    const { errors, parsedDate, qty } = validateRow(row);

    const entry = {
      rowNum: row._rowNum,
      codeCommande: row.codeCommande,
      codeClient: row.codeClient,
      sku: row.sku,
      productName: row.productName,
      quantity: qty,
      date: parsedDate,
      statut: errors.length > 0 ? "ERREUR" : "OK",
      errors,
    };

    rapport.push(entry);
    if (errors.length > 0) continue;

    if (!grouped[row.codeCommande]) {
      grouped[row.codeCommande] = {
        codeCommande: row.codeCommande,
        codeClient: row.codeClient,
        date: parsedDate,
        clrCode: row.clrCode,
        famille: row.famille,
        items: [],
      };
    }
    grouped[row.codeCommande].items.push({
      productName: row.productName || row.sku,
      sku: row.sku,
      quantity: qty,
      conditionnement: row.conditionnement,
      quantitePLT: parseFloat(row.quantitePLT) || null,
      netAPayer: parseFloat(row.netAPayer) || null,
      unit: "unité",
    });
  }

  // Stats
  let created = 0,
    updated = 0,
    errors = 0,
    doublons = 0;

  for (const [codeCommande, cmd] of Object.entries(grouped)) {
    // Chercher produitId via SKU pour chaque item
    for (const item of cmd.items) {
      if (item.sku) {
        const produit = await Produit.findOne({
          where: { sku: item.sku, companyId },
          attributes: ["id"],
        });
        if (produit) item.produitId = produit.id;
      }
    }

    // Doublon check
    const existing = await Order.findOne({
      where: { codeCommande, companyId },
    });

    // Marquer doublon dans rapport
    const rapportRow = rapport.find(
      (r) => r.codeCommande === codeCommande && r.statut === "OK",
    );
    if (existing) {
      doublons++;
      if (rapportRow) rapportRow.statut = "DOUBLON";
      // On met quand même à jour les items
      await OrderItem.destroy({ where: { orderId: existing.id } });
      await OrderItem.bulkCreate(
        cmd.items.map((it) => ({ ...it, orderId: existing.id })),
      );
      updated++;
      continue;
    }

    try {
      const orderNumber = `KC-${codeCommande}-${Date.now()}`;
      const order = await Order.create({
        orderNumber,
        date: cmd.date,
        companyId,
        createdBy: userId,
        source: "EXCEL",
        codeCommande: cmd.codeCommande,
        codeClient: cmd.codeClient,
        famille: cmd.famille,
        clrCode: cmd.clrCode,
        status: "pending",
      });
      await OrderItem.bulkCreate(
        cmd.items.map((it) => ({ ...it, orderId: order.id })),
      );
      created++;
    } catch (e) {
      errors++;
      const rapportRow2 = rapport.find((r) => r.codeCommande === codeCommande);
      if (rapportRow2) {
        rapportRow2.statut = "ERREUR";
        rapportRow2.errors.push(e.message);
      }
    }
  }

  return {
    ok: true,
    rapport,
    stats: { total: rows.length, created, updated, errors, doublons },
  };
}

// ── Commande manuelle ─────────────────────────────────────────────────────
async function createManuelle(body, companyId, userId) {
  const { codeCommande, codeClient, date, clrCode, famille, items } = body;

  if (!codeCommande || !date || !items?.length) {
    throw new Error("codeCommande, date et items sont obligatoires");
  }

  const existing = await Order.findOne({ where: { codeCommande, companyId } });
  if (existing)
    throw new Error(`Code commande "${codeCommande}" déjà existant`);

  const orderNumber = `MAN-${codeCommande}-${Date.now()}`;
  const order = await Order.create({
    orderNumber,
    date,
    companyId,
    createdBy: userId,
    source: "MANUELLE",
    codeCommande,
    codeClient,
    famille,
    clrCode,
    status: "pending",
  });

  const itemsToCreate = await Promise.all(
    items.map(async (it) => {
      let produitId = null;
      if (it.sku) {
        const p = await Produit.findOne({
          where: { sku: it.sku, companyId },
          attributes: ["id"],
        });
        if (p) produitId = p.id;
      }
      return {
        orderId: order.id,
        productName: it.productName || it.sku,
        sku: it.sku,
        quantity: parseFloat(it.quantity),
        conditionnement: it.conditionnement,
        quantitePLT: parseFloat(it.quantitePLT) || null,
        netAPayer: parseFloat(it.netAPayer) || null,
        unit: it.unit || "unité",
        produitId,
      };
    }),
  );

  await OrderItem.bulkCreate(itemsToCreate);
  return order;
}

module.exports = { importExcel, createManuelle };
