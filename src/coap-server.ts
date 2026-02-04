// Serveur CoAP pour Preventis
// Reçoit les données des capteurs via CoAP (UDP port 5683)
import * as coap from 'coap';
import { verifyApiKey } from './lib/auth';
import { updateDeviceValue } from './lib/deviceService';
import prisma from './lib/prisma';

const COAP_PORT = parseInt(process.env.COAP_PORT || '5683', 10);

// Fonction pour écrire dans la table EventLog (base de données)
async function writeToDatabaseLog(level: 'INFO' | 'ERROR', message: string, data?: any) {
  try {
    let dataStr: string | null = null;
    
    if (data !== undefined) {
      try {
        dataStr = typeof data === 'string' 
          ? data 
          : JSON.stringify(data, null, 2);
      } catch (e) {
        dataStr = `[Data serialization error: ${e}]`;
      }
    }
    
    // Écrire dans la table EventLog
    await prisma.eventLog.create({
      data: {
        type: `COAP_${level}`,
        message: message,
        data: dataStr,
      },
    });
  } catch (error) {
    // Si on ne peut pas écrire dans la DB, on log juste dans la console
    console.error('Failed to write to database log:', error);
  }
}

// Helper pour logger avec timestamp - écrit dans la console ET dans la base de données
function logCoAP(message: string, data?: any) {
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
    } catch (e) {
      console.log(logLine);
      console.log(`[Data serialization error: ${e}]`);
    }
  } else {
    console.log(logLine);
  }
  
  // Écrire dans la base de données (asynchrone, ne bloque pas)
  writeToDatabaseLog('INFO', message, data).catch(err => {
    console.error('Failed to write CoAP log to database:', err);
  });
}

function errorCoAP(message: string, error?: any) {
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
    } catch (e) {
      console.error(errorLine);
      console.error(`[Error serialization error: ${e}]`);
      console.error(String(error));
    }
  } else {
    console.error(errorLine);
  }
  
  // Écrire dans la base de données (asynchrone, ne bloque pas)
  writeToDatabaseLog('ERROR', message, error).catch(err => {
    console.error('Failed to write CoAP error to database:', err);
  });
}

// Types pour les requêtes/réponses CoAP
type CoAPRequest = coap.IncomingMessage & {
  url: string;
  method: string;
  payload: Buffer;
};

type CoAPResponse = coap.OutgoingMessage;

/**
 * Extrait l'API key depuis les options CoAP
 * Supporte plusieurs méthodes :
 * - Option personnalisée 'X-API-Key' (si supporté)
 * - Query string dans l'URL (?apiKey=...)
 * - Payload JSON avec apiKey
 */
function extractApiKey(req: CoAPRequest): string | null {
  // Méthode 1: Query string dans l'URL
  try {
    const url = new URL(req.url, 'coap://localhost');
    const apiKey = url.searchParams.get('apiKey');
    if (apiKey) {
      logCoAP(`API key found in query string`, { length: apiKey.length });
      return apiKey;
    }
  } catch (e: any) {
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
  } catch (e: any) {
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
async function authenticateCoAPRequest(req: CoAPRequest): Promise<{ userId: string } | null> {
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    return null;
  }

  const verified = await verifyApiKey(apiKey);
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
function parseDeviceIdFromUrl(url: string): string | null {
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
  } catch (e: any) {
    errorCoAP('Error parsing URL', e);
  }
  return null;
}

/**
 * Crée et démarre le serveur CoAP
 */
export function createCoAPServer() {
  const server = coap.createServer((req: CoAPRequest, res: CoAPResponse) => {
    const rsinfo = req.rsinfo as { address: string; port: number; family?: string };
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

        // Parser le payload
        let payloadData: any;
        try {
          // Le payload peut être vide ou un Buffer
          const payloadStr = req.payload ? req.payload.toString() : '{}';
          if (!payloadStr || payloadStr.trim() === '') {
            payloadData = {};
            logCoAP(`Empty payload, using default {}`);
          } else {
            payloadData = JSON.parse(payloadStr);
            logCoAP(`Parsed payload`, payloadData);
          }
        } catch (e: any) {
          errorCoAP(`Error parsing payload`, { error: e.message, payloadRaw });
          res.code = '4.00'; // Bad Request
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          return;
        }

        // Extraire le deviceId : soit depuis l'URL, soit depuis le payload
        let deviceId: string | null = null;
        
        // Méthode 1: Depuis l'URL /devices/{id}/value
        deviceId = parseDeviceIdFromUrl(req.url);
        
        // Méthode 2: Depuis le payload (format /value)
        if (!deviceId && payloadData.deviceId) {
          deviceId = payloadData.deviceId;
          logCoAP(`DeviceId found in payload: ${deviceId}`);
        }
        
        if (!deviceId) {
          errorCoAP(`DeviceId not found`, { 
            url: req.url, 
            payloadKeys: Object.keys(payloadData),
            message: 'DeviceId must be in URL (/devices/{id}/value) or in payload (deviceId field)'
          });
          res.code = '4.00'; // Bad Request
          res.end(JSON.stringify({ error: 'DeviceId missing. Provide it in URL (/devices/{id}/value) or in payload (deviceId field)' }));
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
        updateDeviceValue({
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
    console.log(`     - coap://0.0.0.0:${COAP_PORT}/devices/{deviceId}/value`);
    console.log(`     - coap://0.0.0.0:${COAP_PORT}/value (with deviceId in payload)`);
    console.log(`   Method: POST`);
    console.log(`   Auth: API key via ?apiKey=... or in payload`);
    console.log(`   ✅ CoAP server is ready to receive requests`);
    console.log(`   ℹ️  Note: Make sure port ${COAP_PORT}/UDP is exposed in Coolify`);
    console.log(`   📝 Logs are written to database (event_logs table)`);
    logCoAP('CoAP server started', { port: COAP_PORT });
  });

  server.on('error', (err: any) => {
    console.error('❌ CoAP server error:', err);
    console.error('   This usually means the port is already in use or not accessible');
  });

  return server;
}
