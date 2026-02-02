"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateJWT = authenticateJWT;
exports.authenticateApiKey = authenticateApiKey;
exports.authenticateOptional = authenticateOptional;
const auth_1 = require("../lib/auth");
const prisma_1 = __importDefault(require("../lib/prisma"));
// Middleware pour authentification JWT (app)
async function authenticateJWT(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token manquant' });
        }
        const token = authHeader.substring(7);
        const decoded = (0, auth_1.verifyToken)(token);
        if (!decoded) {
            return res.status(401).json({ error: 'Token invalide ou expiré' });
        }
        // Récupérer l'utilisateur
        const user = await prisma_1.default.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, email: true, name: true },
        });
        if (!user) {
            return res.status(401).json({ error: 'Utilisateur non trouvé' });
        }
        req.userId = user.id;
        req.user = {
            id: user.id,
            email: user.email,
            name: user.name || undefined,
        };
        next();
    }
    catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ error: 'Erreur d\'authentification' });
    }
}
// Middleware pour authentification par clé API (devices)
async function authenticateApiKey(req, res, next) {
    try {
        const apiKey = req.headers['x-api-key'] ||
            req.headers['authorization']?.replace('Bearer ', '') ||
            req.query.apiKey;
        if (!apiKey) {
            return res.status(401).json({ error: 'Clé API manquante' });
        }
        const verified = await (0, auth_1.verifyApiKey)(apiKey);
        if (!verified) {
            return res.status(401).json({ error: 'Clé API invalide ou expirée' });
        }
        req.userId = verified.userId;
        next();
    }
    catch (error) {
        console.error('API Key auth error:', error);
        res.status(401).json({ error: 'Erreur d\'authentification' });
    }
}
// Middleware optionnel (JWT ou API Key)
async function authenticateOptional(req, res, next) {
    try {
        // Essayer JWT d'abord
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = (0, auth_1.verifyToken)(token);
            if (decoded) {
                const user = await prisma_1.default.user.findUnique({
                    where: { id: decoded.userId },
                    select: { id: true, email: true, name: true },
                });
                if (user) {
                    req.userId = user.id;
                    req.user = {
                        id: user.id,
                        email: user.email,
                        name: user.name || undefined,
                    };
                    return next();
                }
            }
        }
        // Sinon essayer API Key
        const apiKey = req.headers['x-api-key'];
        if (apiKey) {
            const verified = await (0, auth_1.verifyApiKey)(apiKey);
            if (verified) {
                req.userId = verified.userId;
                return next();
            }
        }
        // Pas d'authentification, continuer quand même
        next();
    }
    catch (error) {
        // En cas d'erreur, continuer sans auth
        next();
    }
}
//# sourceMappingURL=auth.js.map