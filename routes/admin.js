// routes/admin.js — Sprint 8 — Admin Panel + Feature Flags
// Accessible uniquement role: admin

const express = require("express");
const router = express.Router();
const { User, Company, CompanyModule, AuditLog } = require("../models");
const { authenticate, authorize } = require("../middleware/auth");
const { log: logAction } = require("../utils/audit");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// Toutes les routes admin nécessitent auth + rôle admin
router.use(authenticate);
router.use(authorize("admin"));
// ────────────────────────────────────────────────────────
// USERS
// ────────────────────────────────────────────────────────

// GET /api/admin/users — liste tous les users de la company
router.get("/users", async (req, res) => {
  try {
    const users = await User.findAll({
      where: { companyId: req.user.companyId },
      attributes: [
        "id",
        "name",
        "email",
        "role",
        "actif",
        "createdAt",
        "lastLogin",
      ],
      order: [["createdAt", "DESC"]],
    });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/admin/users/invite — inviter un user par email
router.post("/users/invite", async (req, res) => {
  const { email, role, name } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: "Email et rôle requis" });
  }

  const ROLES_VALIDES = [
    "admin",
    "planification",
    "transport",
    "keep_contact",
    "prestataire",
    "client",
  ];
  if (!ROLES_VALIDES.includes(role)) {
    return res.status(400).json({ error: "Rôle invalide" });
  }

  try {
    // Vérifier si l'email existe déjà
    const existant = await User.findOne({ where: { email } });
    if (existant) {
      return res.status(409).json({ error: "Cet email est déjà utilisé" });
    }

    // Générer un token d'invitation (valable 48h)
    const invitationToken = crypto.randomBytes(32).toString("hex");
    const invitationExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // Créer le user avec statut inactif en attente d'activation
    const user = await User.create({
      email,
      name: name || "",
      role,
      companyId: req.user.companyId,
      actif: false,
      password: crypto.randomBytes(16).toString("hex"), // mot de passe temporaire
      invitationToken,
      invitationExpiry,
    });

    // Envoyer l'email d'invitation (si SMTP configuré)
    if (process.env.SMTP_HOST) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || "587"),
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });

        const activationUrl = `${process.env.FRONTEND_URL}/register?token=${invitationToken}`;

        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: email,
          subject: "Invitation LogiPlatform",
          html: `
            <h2>Vous avez été invité sur LogiPlatform</h2>
            <p>Rôle : <strong>${role}</strong></p>
            <p><a href="${activationUrl}">Activer mon compte</a></p>
            <p>Ce lien expire dans 48 heures.</p>
          `,
        });
      } catch (mailErr) {
        console.warn("Email non envoyé (SMTP non configuré):", mailErr.message);
      }
    }

    await logAction(req.user.id, "INVITE_USER", {
      email,
      role,
      targetUserId: user.id,
    });

    res.status(201).json({
      message: "Invitation créée",
      userId: user.id,
      invitationToken:
        process.env.NODE_ENV === "development" ? invitationToken : undefined,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /api/admin/users/:id/role — changer le rôle d'un user
router.put("/users/:id/role", async (req, res) => {
  const { role } = req.body;
  const ROLES_VALIDES = [
    "admin",
    "planification",
    "transport",
    "keep_contact",
    "prestataire",
    "client",
  ];

  if (!ROLES_VALIDES.includes(role)) {
    return res.status(400).json({ error: "Rôle invalide" });
  }

  try {
    const user = await User.findOne({
      where: { id: req.params.id, companyId: req.user.companyId },
    });

    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });
    if (user.id === req.user.id)
      return res
        .status(400)
        .json({ error: "Impossible de modifier son propre rôle" });

    const ancienRole = user.role;
    await user.update({ role });

    await logAction(req.user.id, "CHANGE_ROLE", {
      targetUserId: user.id,
      ancienRole,
      nouveauRole: role,
    });

    res.json({
      message: "Rôle mis à jour",
      user: { id: user.id, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/admin/users/:id — désactiver un user (soft delete)
router.delete("/users/:id", async (req, res) => {
  try {
    const user = await User.findOne({
      where: { id: req.params.id, companyId: req.user.companyId },
    });

    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });
    if (user.id === req.user.id)
      return res
        .status(400)
        .json({ error: "Impossible de se désactiver soi-même" });

    await user.update({ actif: false });

    await logAction(req.user.id, "DEACTIVATE_USER", {
      targetUserId: user.id,
      email: user.email,
    });

    res.json({ message: "Utilisateur désactivé" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /api/admin/users/:id/reactivate — réactiver un user
router.put("/users/:id/reactivate", async (req, res) => {
  try {
    const user = await User.findOne({
      where: { id: req.params.id, companyId: req.user.companyId },
    });

    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });

    await user.update({ actif: true });

    await logAction(req.user.id, "REACTIVATE_USER", { targetUserId: user.id });

    res.json({ message: "Utilisateur réactivé" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ────────────────────────────────────────────────────────
// MODULES (Feature Flags)
// ────────────────────────────────────────────────────────

const MODULES_DISPONIBLES = [
  {
    key: "PLANIF_INTEL",
    label: "Planification Intelligente",
    description:
      "Suggestions automatiques de sessions de planification basées sur l'historique.",
    sprint: 4,
  },
  {
    key: "TRANSPORT_INTEL",
    label: "Transport Intelligent",
    description:
      "Optimisation des routes, regroupement d'ordres, alertes incidents.",
    sprint: 5,
  },
  {
    key: "STOCK_INTEL",
    label: "Stock Intelligent",
    description:
      "Détection de ruptures anticipées, analyse rotations, prévisions.",
    sprint: 7,
  },
  {
    key: "KPI_DASHBOARD",
    label: "Dashboard KPI Global",
    description: "Tableau de bord analytique complet avec synthèse IA.",
    sprint: 9,
  },
  {
    key: "PORTAIL_PRESTATAIRE",
    label: "Portail Prestataire",
    description: "Interface dédiée aux transporteurs externes.",
    sprint: 10,
  },
  {
    key: "PORTAIL_CLIENT",
    label: "Portail Client",
    description:
      "Interface de suivi des commandes pour les clients/distributeurs.",
    sprint: 11,
  },
  {
    key: "API_PUBLIQUE",
    label: "API Publique",
    description: "Accès API REST pour intégration ERP externe.",
    sprint: 12,
  },
];

// GET /api/admin/modules — feature flags de la company
router.get("/modules", async (req, res) => {
  try {
    const modulesActifs = await CompanyModule.findAll({
      where: { companyId: req.user.companyId },
    });

    const modulesMap = {};
    modulesActifs.forEach((m) => {
      modulesMap[m.moduleKey] = { actif: m.actif, configJson: m.configJson };
    });

    const result = MODULES_DISPONIBLES.map((mod) => ({
      ...mod,
      actif: modulesMap[mod.key]?.actif || false,
      configJson: modulesMap[mod.key]?.configJson || null,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /api/admin/modules/:key — activer/désactiver un module
router.put("/modules/:key", async (req, res) => {
  const { actif, configJson } = req.body;
  const moduleKey = req.params.key;

  const moduleValide = MODULES_DISPONIBLES.find((m) => m.key === moduleKey);
  if (!moduleValide) {
    return res.status(400).json({ error: "Module inconnu" });
  }

  try {
    const [module, created] = await CompanyModule.findOrCreate({
      where: { companyId: req.user.companyId, moduleKey },
      defaults: { actif: false, configJson: null },
    });

    await module.update({
      actif: actif !== undefined ? actif : module.actif,
      configJson: configJson !== undefined ? configJson : module.configJson,
    });

    await logAction(req.user.id, "TOGGLE_MODULE", {
      moduleKey,
      actif: module.actif,
    });

    res.json({
      message: `Module ${moduleKey} ${module.actif ? "activé" : "désactivé"}`,
      module: { key: moduleKey, actif: module.actif },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ────────────────────────────────────────────────────────
// COMPANY SETTINGS
// ────────────────────────────────────────────────────────

// GET /api/admin/company — paramètres de la company
router.get("/company", async (req, res) => {
  try {
    const company = await Company.findByPk(req.user.companyId, {
      attributes: ["id", "nom", "email", "adresse", "telephone", "createdAt"],
    });

    if (!company) return res.status(404).json({ error: "Company non trouvée" });

    res.json(company);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /api/admin/company — mise à jour paramètres company
router.put("/company", async (req, res) => {
  const { nom, email, adresse, telephone } = req.body;

  try {
    const company = await Company.findByPk(req.user.companyId);
    if (!company) return res.status(404).json({ error: "Company non trouvée" });

    await company.update({ nom, email, adresse, telephone });

    await logAction(req.user.id, "UPDATE_COMPANY", {
      changes: { nom, email, adresse, telephone },
    });

    res.json({ message: "Company mise à jour", company });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ────────────────────────────────────────────────────────
// AUDIT LOG
// ────────────────────────────────────────────────────────

// GET /api/admin/audit — journal des actions (admin)
router.get("/audit", async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const { count, rows } = await AuditLog.findAndCountAll({
      where: { companyId: req.user.companyId },
      include: [{ model: User, as: "user", attributes: ["name", "email"] }],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
      data: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/admin/stats — statistiques rapides pour le dashboard admin
router.get("/stats", async (req, res) => {
  try {
    const [nbUsers, nbUsersActifs, modulesActifs, derniereAction] =
      await Promise.all([
        User.count({ where: { companyId: req.user.companyId } }),
        User.count({ where: { companyId: req.user.companyId, actif: true } }),
        CompanyModule.count({
          where: { companyId: req.user.companyId, actif: true },
        }),
        AuditLog.findOne({
          where: { companyId: req.user.companyId },
          order: [["createdAt", "DESC"]],
        }),
      ]);

    res.json({
      nbUsers,
      nbUsersActifs,
      modulesActifs,
      modulesTotal: MODULES_DISPONIBLES.length,
      derniereAction: derniereAction?.createdAt || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
