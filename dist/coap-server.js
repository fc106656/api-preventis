"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCoAPServer = createCoAPServer;
// Serveur CoAP pour Preventis
// Reçoit les données des capteurs via CoAP (UDP port 5683)
const coap = __importStar(require("coap"));
const crypto = __importStar(require("crypto"));
const auth_1 = require("./lib/auth");
const deviceService_1 = require("./lib/deviceService");
const prisma_1 = __importDefault(require("./lib/prisma"));
const COAP_PORT = parseInt(process.env.COAP_PORT || '5683', 10);
// Clé de décryptage AES-256 (32 bytes)
// Par défaut: la même que dans le client Python (à changer en production!)
const ENCRYPTION_KEY = process.env.COAP_ENCRYPTION_KEY || '12345678901234567890123456789012';
// S'assurer que la clé fait exactement 32 bytes
const ENCRYPTION_KEY_BUFFER = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32), 'utf8');
// Fonction pour écrire dans la table EventLog (base de données)
async function writeToDatabaseLog(level, message, data) {
    try {
        let dataStr = null;
        if (data !== undefined) {
            try {
                dataStr = typeof data === 'string'
                    ? data
                    : JSON.stringify(data, null, 2);
            }
            catch (e) {
                dataStr = `[Data serialization error: ${e}]`;
            }
        }
        // Écrire dans la table EventLog
        await prisma_1.default.eventLog.create({
            data: {
                type: `COAP_${level}`,
                message: message,
                data: dataStr,
            },
        });
    }
    catch (error) {
        // Si on ne peut pas écrire dans la DB, on log juste dans la console
        console.error('Failed to write to database log:', error);
    }
}
// Helper pour logger avec timestamp - écrit dans la console ET dans la base de données
function logCoAP(message, data) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [COAP] ${message}`;
    // Écrire dans la console (pour Coolify)
    if (data !== undefined) {
        try {
            const dataStr = typeof data === 'string'
                ? data
                : JSON.stringify(data, null, 2);
            console.log(logLine);
            console.log(dataStr);
        }
        catch (e) {
            console.log(logLine);
            console.log(`[Data serialization error: ${e}]`);
        }
    }
    else {
        console.log(logLine);
    }
    // Écrire dans la base de données (asynchrone, ne bloque pas)
    writeToDatabaseLog('INFO', message, data).catch(err => {
        console.error('Failed to write CoAP log to database:', err);
    });
}
function errorCoAP(message, error) {
    const timestamp = new Date().toISOString();
    const errorLine = `[${timestamp}] [COAP ERROR] ${message}`;
    // Écrire dans la console (pour Coolify)
    if (error) {
        try {
            const errorData = {
                message: error?.message,
                stack: error?.stack,
                ...(typeof error === 'object' && error !== null ? error : { raw: String(error) }),
            };
            console.error(errorLine);
            console.error(JSON.stringify(errorData, null, 2));
        }
        catch (e) {
            console.error(errorLine);
            console.error(`[Error serialization error: ${e}]`);
            console.error(String(error));
        }
    }
    else {
        console.error(errorLine);
    }
    // Écrire dans la base de données (asynchrone, ne bloque pas)
    writeToDatabaseLog('ERROR', message, error).catch(err => {
        console.error('Failed to write CoAP error to database:', err);
    });
}
/**
 * Extrait l'API key depuis les options CoAP
 * Supporte plusieurs méthodes :
 * - Option personnalisée 'X-API-Key' (si supporté)
 * - Query string dans l'URL (?apiKey=...)
 * - Payload JSON avec apiKey
 */
function extractApiKey(req) {
    // Méthode 1: Query string dans l'URL
    try {
        const url = new URL(req.url, 'coap://localhost');
        let apiKey = url.searchParams.get('apiKey');
        if (apiKey) {
            // Si l'API key contient un '/', prendre seulement la partie avant (format: apiKey/deviceId)
            // Certains clients peuvent envoyer apiKey/deviceId dans le query string
            if (apiKey.includes('/')) {
                const parts = apiKey.split('/');
                apiKey = parts[0]; // Prendre seulement la partie API key
                logCoAP(`API key extracted from query string (removed deviceId suffix)`, {
                    originalLength: url.searchParams.get('apiKey')?.length,
                    extractedLength: apiKey.length
                });
            }
            else {
                logCoAP(`API key found in query string`, { length: apiKey.length });
            }
            return apiKey;
        }
    }
    catch (e) {
        // URL invalide, continuer
        logCoAP(`Could not parse URL for API key extraction`, { error: e.message });
    }
    // Méthode 2: Dans le payload JSON
    try {
        const payload = req.payload ? req.payload.toString() : '';
        if (payload) {
            const data = JSON.parse(payload);
            if (data.apiKey) {
                logCoAP(`API key found in payload`, { length: data.apiKey.length });
                return data.apiKey;
            }
        }
    }
    catch (e) {
        // Pas de JSON valide
        logCoAP(`Could not parse payload for API key extraction`, { error: e.message });
    }
    // Méthode 3: Option CoAP personnalisée (si disponible)
    // Note: node-coap ne supporte pas facilement les options personnalisées
    // On utilisera plutôt la query string ou le payload
    errorCoAP(`No API key found in query string or payload`);
    return null;
}
/**
 * Authentifie la requête CoAP via API key
 */
async function authenticateCoAPRequest(req) {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
        logCoAP(`No API key extracted from request`);
        return null;
    }
    logCoAP(`Verifying API key`, { apiKeyLength: apiKey.length, apiKeyPrefix: apiKey.substring(0, 20) + '...' });
    const verified = await (0, auth_1.verifyApiKey)(apiKey);
    if (!verified) {
        errorCoAP(`API key verification failed`, {
            apiKeyLength: apiKey.length,
            apiKeyPrefix: apiKey.substring(0, 20) + '...',
            reason: 'Key not found, expired, or invalid'
        });
        return null;
    }
    logCoAP(`API key verified successfully`, { userId: verified.userId, apiKeyId: verified.apiKeyId });
    return {
        userId: verified.userId,
    };
}
/**
 * Déchiffre un payload encrypté avec AES-256-CTR
 * Format: IV (16 bytes) + données encryptées
 * Compatible avec ucryptolib.aes en mode CTR (mode 6)
 */
function decryptPayload(encryptedBuffer) {
    try {
        // L'IV fait 16 bytes et est préfixé au payload
        if (encryptedBuffer.length < 16) {
            errorCoAP(`Encrypted payload too short (must be at least 16 bytes for IV)`);
            return null;
        }
        // Extraire l'IV (16 premiers bytes)
        const iv = encryptedBuffer.subarray(0, 16);
        // Le reste est les données encryptées
        const encrypted = encryptedBuffer.subarray(16);
        // Créer le déchiffreur AES-256-CTR
        const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY_BUFFER, iv);
        // Déchiffrer
        let decrypted = decipher.update(encrypted);
        const final = decipher.final();
        decrypted = Buffer.concat([decrypted, final]);
        // Retourner le JSON string
        return decrypted.toString('utf8');
    }
    catch (error) {
        errorCoAP(`Decryption failed`, { error: error.message });
        return null;
    }
}
/**
 * Détecte si un payload est encrypté (binaire) ou en JSON clair
 * Retourne true si le payload semble être encrypté
 */
function isEncrypted(payload) {
    if (!payload || payload.length === 0) {
        return false;
    }
    // Si le payload est très court (< 16 bytes), ce n'est probablement pas encrypté
    if (payload.length < 16) {
        return false;
    }
    // Tenter de parser comme JSON
    try {
        const str = payload.toString('utf8');
        JSON.parse(str);
        // Si ça parse en JSON, ce n'est pas encrypté
        return false;
    }
    catch {
        // Si ça ne parse pas en JSON, c'est probablement encrypté
        // Vérifier aussi que ce n'est pas juste un JSON malformé
        // En général, un payload encrypté commence par des bytes non-printables
        const firstByte = payload[0];
        // Les bytes encryptés sont souvent non-printables (< 32) ou > 126
        // Mais un JSON peut aussi commencer par '{' (123) ou '[' (91)
        // On considère encrypté si les premiers bytes ne sont pas des caractères JSON typiques
        if (firstByte === 0x7B || firstByte === 0x5B || firstByte === 0x22) {
            // '{', '[', ou '"' - probablement du JSON
            return false;
        }
        return true;
    }
}
/**
 * Parse l'URL CoAP pour extraire le device ID
 * Format attendu: /devices/{id}/value
 */
function parseDeviceIdFromUrl(url) {
    try {
        // Enlever le query string si présent
        const path = url.split('?')[0];
        const parts = path.split('/').filter((p) => p);
        // Chercher le pattern /devices/{id}/value
        const devicesIndex = parts.indexOf('devices');
        if (devicesIndex !== -1 && devicesIndex + 1 < parts.length) {
            const deviceId = parts[devicesIndex + 1];
            const nextPart = parts[devicesIndex + 2];
            if (nextPart === 'value') {
                return deviceId;
            }
        }
    }
    catch (e) {
        errorCoAP('Error parsing URL', e);
    }
    return null;
}
/**
 * Crée et démarre le serveur CoAP
 */
function createCoAPServer() {
    const server = coap.createServer((req, res) => {
        const rsinfo = req.rsinfo;
        const payloadRaw = req.payload ? req.payload.toString() : '';
        logCoAP(`REQUEST: ${req.method} ${req.url}`, {
            from: `${rsinfo.address}:${rsinfo.port}`,
            payloadRaw: payloadRaw || '(empty)',
            payloadLength: req.payload ? req.payload.length : 0,
        });
        // Seulement POST est supporté pour l'instant (mise à jour de valeur)
        if (req.method !== 'POST') {
            errorCoAP(`Method not allowed: ${req.method}`);
            res.code = '4.05'; // Method Not Allowed
            res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
            return;
        }
        // Authentification d'abord (nécessaire pour vérifier le deviceId)
        authenticateCoAPRequest(req)
            .then((auth) => {
            if (!auth) {
                errorCoAP(`Authentication failed`);
                res.code = '4.01'; // Unauthorized
                res.end(JSON.stringify({ error: 'API key missing or invalid. Provide ?apiKey=... in URL or in payload.' }));
                return;
            }
            logCoAP(`Authentication successful`, { userId: auth.userId });
            // Parser le payload (avec support du décryptage)
            let payloadData;
            try {
                if (!req.payload || req.payload.length === 0) {
                    payloadData = {};
                    logCoAP(`Empty payload, using default {}`);
                }
                else {
                    // Détecter si le payload est encrypté
                    const isEncryptedPayload = isEncrypted(req.payload);
                    let payloadStr;
                    if (isEncryptedPayload) {
                        logCoAP(`Payload appears to be encrypted, attempting decryption...`, {
                            payloadLength: req.payload.length,
                        });
                        const decrypted = decryptPayload(req.payload);
                        if (!decrypted) {
                            errorCoAP(`Failed to decrypt payload`);
                            res.code = '4.00'; // Bad Request
                            res.end(JSON.stringify({ error: 'Failed to decrypt payload. Check encryption key.' }));
                            return;
                        }
                        payloadStr = decrypted;
                        logCoAP(`Payload decrypted successfully`, { decryptedLength: payloadStr.length });
                    }
                    else {
                        // Payload en JSON clair
                        payloadStr = req.payload.toString('utf8');
                        logCoAP(`Payload is plain JSON (not encrypted)`);
                    }
                    if (!payloadStr || payloadStr.trim() === '') {
                        payloadData = {};
                        logCoAP(`Empty payload after decryption/parsing, using default {}`);
                    }
                    else {
                        payloadData = JSON.parse(payloadStr);
                        logCoAP(`Parsed payload`, payloadData);
                    }
                }
            }
            catch (e) {
                errorCoAP(`Error parsing payload`, {
                    error: e.message,
                    payloadRaw: payloadRaw.substring(0, 100), // Limiter la taille du log
                    payloadLength: req.payload ? req.payload.length : 0,
                });
                res.code = '4.00'; // Bad Request
                res.end(JSON.stringify({ error: 'Invalid JSON payload or decryption failed' }));
                return;
            }
            // Extraire le deviceId : PRIORITÉ au payload, puis fallback sur l'URL
            let deviceId = null;
            // PRIORITÉ 1: Depuis le payload (méthode principale)
            if (payloadData.deviceId) {
                deviceId = payloadData.deviceId;
                logCoAP(`DeviceId found in payload: ${deviceId}`);
            }
            // FALLBACK: Depuis l'URL seulement si pas trouvé dans le payload
            if (!deviceId) {
                // Méthode 1: Depuis l'URL /devices/{id}/value
                deviceId = parseDeviceIdFromUrl(req.url);
                // Méthode 2: URL directe avec deviceId (format: /{deviceId}?apiKey=...)
                if (!deviceId) {
                    try {
                        const urlPath = req.url.split('?')[0]; // Enlever le query string
                        const pathParts = urlPath.split('/').filter((p) => p);
                        // Si l'URL est juste un UUID (format deviceId), l'utiliser
                        if (pathParts.length === 1) {
                            const potentialDeviceId = pathParts[0];
                            // Vérifier si ça ressemble à un UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
                            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                            if (uuidRegex.test(potentialDeviceId)) {
                                deviceId = potentialDeviceId;
                                logCoAP(`DeviceId extracted from direct URL path (fallback): ${deviceId}`);
                            }
                        }
                    }
                    catch (e) {
                        logCoAP(`Could not parse deviceId from direct URL`, { error: e.message });
                    }
                }
                else {
                    logCoAP(`DeviceId extracted from URL path (fallback): ${deviceId}`);
                }
            }
            if (!deviceId) {
                errorCoAP(`DeviceId not found`, {
                    url: req.url,
                    payloadKeys: Object.keys(payloadData),
                    message: 'DeviceId must be in payload (deviceId field) or in URL as fallback'
                });
                res.code = '4.00'; // Bad Request
                res.end(JSON.stringify({ error: 'DeviceId missing. Provide it in payload (deviceId field) or in URL as fallback.' }));
                return;
            }
            logCoAP(`DeviceId resolved: ${deviceId}`);
            // Extraire value et batteryLevel, en excluant apiKey du payload si présent
            const { value, batteryLevel, apiKey: _apiKey, ...rest } = payloadData;
            logCoAP(`Extracted values`, { value, batteryLevel, ignoredFields: Object.keys(rest) });
            if (value === undefined || value === null) {
                errorCoAP(`Missing required field 'value' in payload`, { payloadData });
                res.code = '4.00'; // Bad Request
                res.end(JSON.stringify({ error: 'Missing required field: value' }));
                return;
            }
            const parsedValue = parseFloat(String(value));
            const parsedBattery = batteryLevel !== undefined ? parseInt(String(batteryLevel)) : undefined;
            logCoAP(`Updating device`, { deviceId, value: parsedValue, batteryLevel: parsedBattery });
            // Mettre à jour la valeur du device
            (0, deviceService_1.updateDeviceValue)({
                deviceId,
                userId: auth.userId,
                value: parsedValue,
                batteryLevel: parsedBattery,
            })
                .then((result) => {
                if (!result.success) {
                    errorCoAP(`Update failed for device ${deviceId}`, { error: result.error });
                    res.code = result.error === 'Device non trouvé' ? '4.04' : '5.00'; // Not Found ou Internal Server Error
                    res.end(JSON.stringify({ error: result.error || 'Error updating device' }));
                    return;
                }
                // Succès
                logCoAP(`Device updated successfully`, {
                    deviceId: result.device?.id,
                    value: result.device?.value,
                    status: result.device?.status,
                });
                res.code = '2.04'; // Changed
                res.end(JSON.stringify({
                    success: true,
                    device: {
                        id: result.device?.id,
                        value: result.device?.value,
                        status: result.device?.status,
                    },
                }));
            })
                .catch((error) => {
                errorCoAP(`Error in updateDeviceValue`, error);
                res.code = '5.00'; // Internal Server Error
                res.end(JSON.stringify({ error: 'Internal server error' }));
            });
        })
            .catch((error) => {
            errorCoAP(`Error in authentication`, error);
            res.code = '5.00'; // Internal Server Error
            res.end(JSON.stringify({ error: 'Authentication error' }));
        });
    });
    server.listen(COAP_PORT, () => {
        console.log(`📡 CoAP server listening on port ${COAP_PORT} (UDP)`);
        console.log(`   Endpoints:`);
        console.log(`     - coap://0.0.0.0:${COAP_PORT}/value (RECOMMANDÉ: deviceId in payload)`);
        console.log(`     - coap://0.0.0.0:${COAP_PORT}/devices/{deviceId}/value (fallback)`);
        console.log(`     - coap://0.0.0.0:${COAP_PORT}/{deviceId} (fallback)`);
        console.log(`   Method: POST`);
        console.log(`   Auth: API key via ?apiKey=... or in payload`);
        console.log(`   ⚠️  DeviceId: PRIORITÉ au payload, URL en fallback uniquement`);
        console.log(`   🔐 Encryption: AES-256-CTR supported (auto-detect)`);
        console.log(`   🔑 Encryption key: ${ENCRYPTION_KEY.substring(0, 8)}... (${ENCRYPTION_KEY.length} chars)`);
        if (ENCRYPTION_KEY === '12345678901234567890123456789012') {
            console.log(`   ⚠️  WARNING: Using default encryption key! Set COAP_ENCRYPTION_KEY env var in production!`);
        }
        console.log(`   ✅ CoAP server is ready to receive requests`);
        console.log(`   ℹ️  Note: Make sure port ${COAP_PORT}/UDP is exposed in Coolify`);
        console.log(`   📝 Logs are written to database (event_logs table)`);
        logCoAP('CoAP server started', { port: COAP_PORT });
    });
    server.on('error', (err) => {
        console.error('❌ CoAP server error:', err);
        console.error('   This usually means the port is already in use or not accessible');
    });
    return server;
}
//# sourceMappingURL=coap-server.js.map