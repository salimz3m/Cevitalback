const jwt = require("jsonwebtoken");
const { User } = require("../models");

// Vérifie le token JWT dans le header Authorization
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token manquant ou invalide" });
    }
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user)
      return res.status(401).json({ message: "Utilisateur introuvable" });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token expiré ou invalide" });
  }
};

// Restreint l'accès à certains rôles
const authorize =
  (...roles) =>
  (req, res, next) => {
    const flat = roles.flat(); // aplatit si tableau passé en argument
    if (!flat.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Accès refusé : rôle insuffisant" });
    }
    next();
  };
module.exports = { authenticate, authorize };
