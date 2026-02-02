"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCoAPServer = createCoAPServer;
// Serveur CoAP pour Preventis
// Reçoit les données des capteurs via CoAP (UDP port 5683)
const coap_1 = __importDefault(require("coap"));
const auth_1 = require("./lib/auth");
const deviceService_1 = require("./lib/deviceService");
const COAP_PORT = parseInt(process.env.COAP_PORT || '5683', 10);
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
        const apiKey = url.searchParams.get('apiKey');
        if (apiKey)
            return apiKey;
    }
    catch (e) {
        // URL invalide, continuer
    }
    // Méthode 2: Dans le payload JSON
    try {
        const payload = req.payload.toString();
        if (payload) {
            const data = JSON.parse(payload);
            if (data.apiKey)
                return data.apiKey;
        }
    }
    catch (e) {
        // Pas de JSON valide
    }
    // Méthode 3: Option CoAP personnalisée (si disponible)
    // Note: node-coap ne supporte pas facilement les options personnalisées
    // On utilisera plutôt la query string ou le payload
    return null;
}
/**
 * Authentifie la requête CoAP via API key
 */
async function authenticateCoAPRequest(req) {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
        return null;
    }
    const verified = await (0, auth_1.verifyApiKey)(apiKey);
    if (!verified) {
        return null;
    }
    return {
        userId: verified.userId,
    };
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
        console.error('Error parsing URL:', e);
    }
    return null;
}
/**
 * Crée et démarre le serveur CoAP
 */
function createCoAPServer() {
    const server = coap_1.default.createServer((req, res) => {
        const rsinfo = req.rsinfo;
        console.log(`📡 CoAP request: ${req.method} ${req.url} from ${rsinfo.address}:${rsinfo.port}`);
        // Seulement POST est supporté pour l'instant (mise à jour de valeur)
        if (req.method !== 'POST') {
            res.code = '4.05'; // Method Not Allowed
            res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
            return;
        }
        // Route: POST /devices/:id/value
        const deviceId = parseDeviceIdFromUrl(req.url);
        if (!deviceId) {
            res.code = '4.04'; // Not Found
            res.end(JSON.stringify({ error: 'Invalid route. Use POST /devices/{id}/value' }));
            return;
        }
        // Authentification
        authenticateCoAPRequest(req)
            .then((auth) => {
            if (!auth) {
                res.code = '4.01'; // Unauthorized
                res.end(JSON.stringify({ error: 'API key missing or invalid. Provide ?apiKey=... in URL or in payload.' }));
                return;
            }
            // Parser le payload
            let payloadData;
            try {
                const payloadStr = req.payload.toString();
                payloadData = JSON.parse(payloadStr);
            }
            catch (e) {
                res.code = '4.00'; // Bad Request
                res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
                return;
            }
            const { value, batteryLevel } = payloadData;
            if (value === undefined || value === null) {
                res.code = '4.00'; // Bad Request
                res.end(JSON.stringify({ error: 'Missing required field: value' }));
                return;
            }
            // Mettre à jour la valeur du device
            (0, deviceService_1.updateDeviceValue)({
                deviceId,
                userId: auth.userId,
                value: parseFloat(String(value)),
                batteryLevel: batteryLevel !== undefined ? parseInt(String(batteryLevel)) : undefined,
            })
                .then((result) => {
                if (!result.success) {
                    res.code = result.error === 'Device non trouvé' ? '4.04' : '5.00'; // Not Found ou Internal Server Error
                    res.end(JSON.stringify({ error: result.error || 'Error updating device' }));
                    return;
                }
                // Succès
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
                console.error('Error in updateDeviceValue:', error);
                res.code = '5.00'; // Internal Server Error
                res.end(JSON.stringify({ error: 'Internal server error' }));
            });
        })
            .catch((error) => {
            console.error('Error in authentication:', error);
            res.code = '5.00'; // Internal Server Error
            res.end(JSON.stringify({ error: 'Authentication error' }));
        });
    });
    server.listen(COAP_PORT, () => {
        console.log(`📡 CoAP server listening on port ${COAP_PORT}`);
        console.log(`   Endpoint: coap://0.0.0.0:${COAP_PORT}/devices/{deviceId}/value`);
        console.log(`   Method: POST`);
        console.log(`   Auth: API key via ?apiKey=... or in payload`);
    });
    return server;
}
//# sourceMappingURL=coap-server.js.map