require("dotenv").config();
const express = require("express");
const cors = require("cors");

// 🔥 IMPORTANT : force le chargement de tous les modèles
require("./models");

const { sequelize } = require("./models");

const app = express();

// ─── Routes ─────────────────────────────────────────────────────
const infrastructureRoutes = require("./routes/infrastructure");
const planificationRoutes = require("./routes/planification");
const transportRoutes = require("./routes/transport");
const planningIntelRoutes = require("./routes/modules/planning-intel");
const transportIntelRoutes = require("./routes/modules/transport-intel");
const stockRoutes = require("./routes/stock");
const stockIntelRoutes = require("./routes/modules/stock-intel");
const adminRoutes = require("./routes/admin");
const keepContactRouter = require("./routes/keepContact");
const commercialRoutes = require("./routes/commercial");
const kpiRoutes = require("./routes/kpi");
// ─── Middleware ──────────────────────────────────────────────────
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes API ──────────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth"));

app.use("/api/companies", require("./routes/companies"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/deliveries", require("./routes/deliveries"));
app.use("/api/drivers", require("./routes/drivers"));
app.use("/api/import", require("./routes/import"));
app.use("/api/infrastructure", infrastructureRoutes);
app.use("/api/planification", planificationRoutes);
app.use("/api/transport", transportRoutes);
app.use("/api/modules/planning-intel", planningIntelRoutes);
app.use("/api/modules/transport-intel", transportIntelRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/modules/stock-intel", stockIntelRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/keep-contact", keepContactRouter);
app.use("/api/commercial", commercialRoutes);
app.use("/api/kpi", kpiRoutes);
// ─── Health check ────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// ─── Démarrage propre ────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ DB connectée");

    // 🔍 Vérification des modèles chargés
    console.log("📦 Models chargés :", Object.keys(sequelize.models));

    await sequelize.sync();
    console.log("✅ Base de données synchronisée");

    app.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Erreur démarrage:", err);
  }
};

startServer();

module.exports = app;
