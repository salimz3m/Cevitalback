// generate-commandes.js
// Lance avec : node generate-commandes.js
// Génère : commandes_keepcontact.xlsx

const XLSX = require("xlsx");

const data = [
  // En-têtes
  [
    "Code",
    "CodeClient",
    "Code Commande",
    "Date commande",
    "Famille",
    "Code Article",
    "Designation Produit",
    "Conditionnement",
    "Quantité",
    "Quantité PLT",
    "Net à payer",
  ],

  // Commandes — Client 1 (CLR-EST-01)
  [
    "CLR-EST-01",
    "CLI-001",
    "CMD-2025-001",
    "2025-05-01",
    "HUILE",
    "HUI-FLE-1L",
    "Huile Fleurial 1L",
    "Carton 12u",
    120,
    2.4,
    216000,
  ],
  [
    "CLR-EST-01",
    "CLI-001",
    "CMD-2025-001",
    "2025-05-01",
    "HUILE",
    "HUI-FLE-5L",
    "Huile Fleurial 5L",
    "Carton 4u",
    80,
    2.0,
    288000,
  ],
  [
    "CLR-EST-01",
    "CLI-001",
    "CMD-2025-001",
    "2025-05-01",
    "SUCRE",
    "SUC-BLA-1K",
    "Sucre Blanc 1kg",
    "Sac 50kg",
    50,
    1.0,
    75000,
  ],
  [
    "CLR-EST-01",
    "CLI-001",
    "CMD-2025-001",
    "2025-05-01",
    "MARGARINE",
    "MAR-SKO-500",
    "Margarine Skor 500g",
    "Carton 24u",
    96,
    2.0,
    172800,
  ],

  // Commandes — Client 2 (CLR-CTR-01)
  [
    "CLR-CTR-01",
    "CLI-002",
    "CMD-2025-002",
    "2025-05-02",
    "HUILE",
    "HUI-ELI-2L",
    "Huile Elio 2L",
    "Carton 6u",
    60,
    1.2,
    144000,
  ],
  [
    "CLR-CTR-01",
    "CLI-002",
    "CMD-2025-002",
    "2025-05-02",
    "MARGARINE",
    "MAR-MAT-250",
    "Margarine Matina 250g",
    "Carton 48u",
    48,
    1.0,
    86400,
  ],
  [
    "CLR-CTR-01",
    "CLI-002",
    "CMD-2025-002",
    "2025-05-02",
    "CHOCOLAT",
    "CHO-CAP-100",
    "Chocolat Capita 100g",
    "Carton 30u",
    90,
    1.5,
    135000,
  ],
  [
    "CLR-CTR-01",
    "CLI-002",
    "CMD-2025-002",
    "2025-05-02",
    "SAUCE",
    "SAU-TCH-350",
    "Sauce Tchina 350g",
    "Carton 12u",
    36,
    0.7,
    54000,
  ],

  // Commandes — Client 3 (CLR-OUE-01)
  [
    "CLR-OUE-01",
    "CLI-003",
    "CMD-2025-003",
    "2025-05-03",
    "HUILE",
    "HUI-FLE-1L",
    "Huile Fleurial 1L",
    "Carton 12u",
    200,
    4.0,
    360000,
  ],
  [
    "CLR-OUE-01",
    "CLI-003",
    "CMD-2025-003",
    "2025-05-03",
    "SUCRE",
    "SUC-BLA-1K",
    "Sucre Blanc 1kg",
    "Sac 50kg",
    100,
    2.0,
    150000,
  ],
  [
    "CLR-OUE-01",
    "CLI-003",
    "CMD-2025-003",
    "2025-05-03",
    "SMEN",
    "SME-ASS-500",
    "Smen Assila 500g",
    "Carton 12u",
    72,
    1.5,
    151200,
  ],
  [
    "CLR-OUE-01",
    "CLI-003",
    "CMD-2025-003",
    "2025-05-03",
    "MIEL",
    "MIE-MED-250",
    "Miel Medina 250g",
    "Carton 24u",
    48,
    1.0,
    192000,
  ],

  // Commandes — Client 4 (CLR-EST-02)
  [
    "CLR-EST-02",
    "CLI-004",
    "CMD-2025-004",
    "2025-05-04",
    "HUILE",
    "HUI-FLE-5L",
    "Huile Fleurial 5L",
    "Carton 4u",
    40,
    1.0,
    144000,
  ],
  [
    "CLR-EST-02",
    "CLI-004",
    "CMD-2025-004",
    "2025-05-04",
    "MARGARINE",
    "MAR-SKO-250",
    "Margarine Skor 250g",
    "Carton 48u",
    96,
    2.0,
    86400,
  ],
  [
    "CLR-EST-02",
    "CLI-004",
    "CMD-2025-004",
    "2025-05-04",
    "BOISSON",
    "BOI-FOO-33",
    "Boisson Foody's 33cl",
    "Carton 24u",
    72,
    1.5,
    86400,
  ],
  [
    "CLR-EST-02",
    "CLI-004",
    "CMD-2025-004",
    "2025-05-04",
    "CONFITURE",
    "CON-FOO-400",
    "Confiture Foody's 400g",
    "Carton 12u",
    36,
    0.7,
    72000,
  ],

  // Commandes — Client 5 (CLR-CTR-02)
  [
    "CLR-CTR-02",
    "CLI-005",
    "CMD-2025-005",
    "2025-05-05",
    "HUILE",
    "HUI-ELI-1L",
    "Huile Elio 1L",
    "Carton 12u",
    150,
    3.0,
    225000,
  ],
  [
    "CLR-CTR-02",
    "CLI-005",
    "CMD-2025-005",
    "2025-05-05",
    "SUCRE",
    "SUC-BLA-1K",
    "Sucre Blanc 1kg",
    "Sac 50kg",
    75,
    1.5,
    112500,
  ],
  [
    "CLR-CTR-02",
    "CLI-005",
    "CMD-2025-005",
    "2025-05-05",
    "SAUCE",
    "SAU-TCH-700",
    "Sauce Tchina 700g",
    "Carton 6u",
    60,
    1.0,
    108000,
  ],
  [
    "CLR-CTR-02",
    "CLI-005",
    "CMD-2025-005",
    "2025-05-05",
    "CHOCOLAT",
    "CHO-CAP-200",
    "Chocolat Capita 200g",
    "Carton 20u",
    40,
    0.8,
    80000,
  ],
];

// Créer le workbook
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(data);

// Largeurs colonnes
ws["!cols"] = [
  { wch: 14 }, // Code
  { wch: 12 }, // CodeClient
  { wch: 16 }, // Code Commande
  { wch: 16 }, // Date commande
  { wch: 12 }, // Famille
  { wch: 16 }, // Code Article
  { wch: 28 }, // Designation Produit
  { wch: 16 }, // Conditionnement
  { wch: 10 }, // Quantité
  { wch: 12 }, // Quantité PLT
  { wch: 14 }, // Net à payer
];

// Style en-tête (gras)
const headerRange = XLSX.utils.decode_range(ws["!ref"]);
for (let C = headerRange.s.c; C <= headerRange.e.c; C++) {
  const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
  if (!ws[cellAddr]) continue;
  ws[cellAddr].s = { font: { bold: true } };
}

XLSX.utils.book_append_sheet(wb, ws, "Commandes");
XLSX.writeFile(wb, "commandes_keepcontact.xlsx");
console.log("✅ commandes_keepcontact.xlsx généré !");
