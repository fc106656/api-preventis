"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.generateToken = generateToken;
exports.verifyToken = verifyToken;
exports.generateApiKey = generateApiKey;
exports.hashApiKey = hashApiKey;
exports.verifyApiKey = verifyApiKey;
// Utilitaires d'authentification
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("./prisma"));
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
// Hash un mot de passe
async function hashPassword(password) {
    return bcrypt_1.default.hash(password, 10);
}
// Vérifie un mot de passe
async function verifyPassword(password, hash) {
    return bcrypt_1.default.compare(password, hash);
}
// Génère un JWT
function generateToken(userId, email) {
    return jsonwebtoken_1.default.sign({ userId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
// Vérifie un JWT
function verifyToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        return decoded;
    }
    catch (error) {
        return null;
    }
}
// Génère une clé API
function generateApiKey() {
    // Format: pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    const randomBytes = crypto_1.default.randomBytes(32).toString('hex');
    return `pk_live_${randomBytes}`;
}
// Hash une clé API pour stockage
function hashApiKey(key) {
    return crypto_1.default.createHash('sha256').update(key).digest('hex');
}
// Vérifie une clé API
async function verifyApiKey(apiKey) {
    const keyHash = hashApiKey(apiKey);
    const apiKeyRecord = await prisma_1.default.apiKey.findUnique({
        where: { keyHash },
        include: { user: true },
    });
    if (!apiKeyRecord) {
        return null;
    }
    // Vérifier expiration
    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
        return null;
    }
    // Mettre à jour lastUsedAt
    await prisma_1.default.apiKey.update({
        where: { id: apiKeyRecord.id },
        data: { lastUsedAt: new Date() },
    });
    return {
        userId: apiKeyRecord.userId,
        apiKeyId: apiKeyRecord.id,
    };
}
//# sourceMappingURL=auth.js.map