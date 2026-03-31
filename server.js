require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { sequelize } = require("./models");

const app = express();

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

// ─── Health check ────────────────────────────────────────────────
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", timestamp: new Date() }),
);

// ─── Démarrage ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

sequelize
  .sync({ alter: true }) // alter:true met à jour les tables sans les recréer
  .then(() => {
    console.log("✅ Base de données synchronisée");
    app.listen(PORT, () =>
      console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`),
    );
  })
  .catch((err) => {
    console.error("❌ Erreur de connexion à la base de données:", err.message);
    process.exit(1);
  });

module.exports = app;
