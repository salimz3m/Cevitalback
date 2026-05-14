const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User, Company } = require("../models");
const { authenticate } = require("../middleware/auth");

// GET /api/auth/verify-invitation?token=xxx
// Vérifie la validité du token et retourne les infos de l'utilisateur invité
router.get("/verify-invitation", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Token manquant" });

  try {
    const user = await User.findOne({
      where: { invitationToken: token },
      attributes: [
        "id",
        "email",
        "nom",
        "prenom",
        "role",
        "invitationExpiry",
        "actif",
      ],
    });

    if (!user) {
      return res.status(404).json({ error: "Token invalide ou déjà utilisé" });
    }

    if (user.actif) {
      return res.status(400).json({ error: "Ce compte est déjà activé" });
    }

    if (user.invitationExpiry && new Date() > new Date(user.invitationExpiry)) {
      return res.status(410).json({ error: "Invitation expirée" });
    }

    res.json({
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/auth/register
// Active le compte et définit le mot de passe
router.post("/register", async (req, res) => {
  const { token, nom, prenom, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: "Token et mot de passe requis" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "Mot de passe trop court (8 caractères minimum)" });
  }

  try {
    const user = await User.findOne({ where: { invitationToken: token } });

    if (!user) {
      return res.status(404).json({ error: "Token invalide ou déjà utilisé" });
    }

    if (user.actif) {
      return res.status(400).json({ error: "Ce compte est déjà activé" });
    }

    if (user.invitationExpiry && new Date() > new Date(user.invitationExpiry)) {
      return res
        .status(410)
        .json({ error: "Invitation expirée. Contactez votre administrateur." });
    }

    const hash = await bcrypt.hash(password, 10);

    await user.update({
      password: hash,
      nom: nom?.trim() || user.nom,
      prenom: prenom?.trim() || user.prenom,
      actif: true,
      invitationToken: null,
      invitationExpiry: null,
    });

    // Optionnel : logAction si l'utilitaire audit est accessible sans req.user
    // await logAction(user.id, 'ACCOUNT_ACTIVATED', { email: user.email });

    res.json({ message: "Compte activé avec succès", email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email et mot de passe requis" });

    const user = await User.findOne({ where: { email }, include: [Company] });
    if (!user)
      return res.status(401).json({ message: "Identifiants incorrects" });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid)
      return res.status(401).json({ message: "Identifiants incorrects" });

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        companyId: user.companyId, // 🔥 AJOUT ICI
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      },
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company: user.Company?.name,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// GET /api/auth/me
router.get("/me", authenticate, async (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    role: req.user.role,
    companyId: req.user.companyId,
  });
});

module.exports = router;
