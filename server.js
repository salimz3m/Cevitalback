require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { sequelize } = require("./models");

const app = express();
const infrastructureRoutes = require("./routes/infrastructure");
const planificationRoutes = require("./routes/planification");
const transportRoutes = require("./routes/transport");
const planningIntelRoutes = require("./routes/modules/planning-intel");
const transportIntelRoutes = require("./routes/modules/transport-intel"); // ← Sprint 5

// ─── Middleware ──────────────────────────────────────────────────
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ─────────────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth"));
app.use("/api/companies", require("./routes/companies"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/deliveries", require("./routes/deliveries"));
app.use("/api/drivers", require("./routes/drivers"));
app.use("/api/stock", require("./routes/stock"));
app.use("/api/import", require("./routes/import"));
app.use("/api/infrastructure", infrastructureRoutes);
app.use("/api/planification", planificationRoutes);
app.use("/api/transport", transportRoutes);
app.use("/api/modules/planning-intel", planningIntelRoutes);
console.log("🔥 transport-intel loaded");
app.use("/api/modules/transport-intel", transportIntelRoutes); // ← Sprint 5

// ─── Health check ────────────────────────────────────────────────
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", timestamp: new Date() }),
);

// ─── Démarrage ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
sequelize
  .sync()
  .then(() => {
    console.log("✅ Base de données synchronisée");
    app.listen(PORT, () =>
      console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`),
    );
  })
  .catch((err) => {
    console.error("❌ Erreur sync DB:", err);
  });

module.exports = app;
