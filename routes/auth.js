const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User, Company } = require("../models");
const { authenticate } = require("../middleware/auth");

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, role, companyId } = req.body;
    if (!email || !password || !companyId)
      return res
        .status(400)
        .json({ message: "Email, mot de passe et companyId requis" });

    const existing = await User.findOne({ where: { email } });
    if (existing)
      return res.status(409).json({ message: "Email déjà utilisé" });

    const company = await Company.findByPk(companyId);
    if (!company)
      return res.status(404).json({ message: "Entreprise introuvable" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      password: hashedPassword,
      name,
      role,
      companyId,
    });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      },
    );

    res.status(201).json({
      message: "Utilisateur créé",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
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
      { id: user.id, role: user.role },
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
