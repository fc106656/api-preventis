// Serveur CoAP pour Preventis
// Reçoit les données des capteurs via CoAP (UDP port 5683)
import * as coap from 'coap';
import * as crypto from 'crypto';
import { AlarmMode } from '@prisma/client';
import { verifyApiKey } from './lib/auth';
import { updateDeviceValue } from './lib/deviceService';
import prisma from './lib/prisma';

const COAP_PORT = parseInt(process.env.COAP_PORT || '5683', 10);

// Clé AES dérivée d'un secret (compatible avec MicroPython's hashlib.sha256)
const AES_SECRET = process.env.COAP_AES_SECRET || 'Password';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(AES_SECRET).digest();

console.log('🔑 AES-256-CBC encryption configured');
console.log(`   Secret: ${AES_SECRET.substring(0, Math.min(8, AES_SECRET.length))}... (${AES_SECRET.length} chars)`);
if (AES_SECRET === 'Password' || AES_SECRET === 'your-very-secure-password') {
  console.log('⚠️  WARNING: Using default AES secret! Set COAP_AES_SECRET env var in production!');
  console.log(`   ⚠️  Make sure the client uses the same secret: "${AES_SECRET}"`);
}

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
  method: string | number; // node-coap peut utiliser string ou code numérique
  payload: Buffer;
};

type CoAPResponse = coap.OutgoingMessage;


/**
 * Déchiffre un payload encrypté avec AES-256-CBC (Base64)
 * Matches the MicroPython AESCipher/CoAPClient implementation
 * Format: Base64 string containing IV (16 bytes) + ciphertext
 */
function decryptPayload(encryptedBuffer: Buffer): any {
  try {
    if (!encryptedBuffer || encryptedBuffer.length === 0) {
      errorCoAP(`Empty payload received`);
      return null;
    }

    // 1. Convert buffer to string and clean it (remove whitespace, newlines)
    // MicroPython's b2a_base64 adds a newline that is stripped, but we should handle it
    let base64String = encryptedBuffer.toString('utf8').trim();
    
    // Remove any whitespace characters that might interfere
    base64String = base64String.replace(/\s+/g, '');
    
    logCoAP(`Base64 payload received`, { 
      rawLength: encryptedBuffer.length,
      base64Length: base64String.length,
      base64Preview: base64String.substring(0, 50) + '...',
    });

    // 2. Decode Base64 to get IV + ciphertext
    let combinedData: Buffer;
    try {
      combinedData = Buffer.from(base64String, 'base64');
    } catch (e: any) {
      errorCoAP(`Invalid Base64 encoding`, { error: e.message });
      return null;
    }

    // 3. Extract IV (first 16 bytes) and Ciphertext (the rest)
    if (combinedData.length < 16) {
      errorCoAP(`Payload too short for IV extraction`, { 
        combinedLength: combinedData.length,
        expectedMin: 16,
      });
      return null;
    }

    const iv = combinedData.slice(0, 16);
    const ciphertext = combinedData.slice(16);

    // Verify ciphertext length is a multiple of 16 (required for AES block cipher)
    if (ciphertext.length % 16 !== 0) {
      errorCoAP(`Ciphertext length is not a multiple of 16`, { 
        cipherLength: ciphertext.length,
        ivLength: iv.length,
        totalLength: combinedData.length,
      });
      return null;
    }

    logCoAP(`Attempting AES-256-CBC decryption`, { 
      ivLength: iv.length, 
      cipherLength: ciphertext.length,
      base64Length: base64String.length,
      combinedDataLength: combinedData.length,
      encryptionKeyLength: ENCRYPTION_KEY.length,
      aesSecret: AES_SECRET.substring(0, 8) + '...',
    });

    // 4. Decrypt using AES-256-CBC
    // Node's 'aes-256-cbc' handles PKCS7 padding automatically
    // The client does manual padding, but Node.js will handle it correctly during decryption
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    // 5. Parse the resulting JSON
    const jsonString = decrypted.toString('utf8');
    logCoAP(`Decrypted JSON string`, { 
      jsonLength: jsonString.length,
      jsonPreview: jsonString.substring(0, 100) + '...',
    });

    const payloadData = JSON.parse(jsonString);
    logCoAP(`Payload decrypted successfully via AES-256-CBC`, { 
      keys: Object.keys(payloadData),
      hasDeviceId: !!payloadData.deviceId,
      hasApiKey: !!payloadData.apiKey,
      hasValue: payloadData.value !== undefined,
    });

    return payloadData;
  } catch (error: any) {
    errorCoAP(`AES decryption failed. Check if secret keys match.`, { 
      error: error.message,
      errorStack: error.stack?.substring(0, 200),
      payloadLength: encryptedBuffer?.length || 0,
      aesSecret: AES_SECRET.substring(0, 8) + '...',
    });
    return null;
  }
}


/**
 * Récupère tous les paramètres de commande/configuration pour une gateway
 * Retourne uniquement ce que le cloud veut envoyer à l'edge, pas les données des capteurs
 */
async function getAlarmParameters(userId: string) {
  try {
    // État de l'alarme (commandes à appliquer)
    let alarmState = await prisma.alarmState.findUnique({
      where: { id: 'main' },
    });

    if (!alarmState) {
      alarmState = await prisma.alarmState.create({
        data: { id: 'main', isArmed: false, mode: AlarmMode.OFF, sirenActive: false },
      });
    }

    return {
      alarm: {
        isArmed: alarmState.isArmed,      // Commande : armer/désarmer le système (tout ou rien)
        mode: alarmState.mode,             // Commande : mode (OFF, HOME, AWAY, NIGHT)
        sirenActive: alarmState.sirenActive, // Commande : activer/désactiver la sirène
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    errorCoAP(`Error fetching alarm parameters`, { error: error.message });
    throw error;
  }
}

/**
 * Crée et démarre le serveur CoAP
 */
export function createCoAPServer() {
  const server = coap.createServer((req: CoAPRequest, res: CoAPResponse) => {
    const rsinfo = req.rsinfo as { address: string; port: number; family?: string };
    
    logCoAP(`REQUEST: ${req.method} ${req.url}`, {
      from: `${rsinfo.address}:${rsinfo.port}`,
      payloadLength: req.payload ? req.payload.length : 0,
      url: req.url,
    });

    // Gérer les requêtes POST (MicroPython ne peut pas envoyer de payload avec GET)
    // POST peut être utilisé pour :
    // 1. Récupérer les paramètres (payload avec juste apiKey, sans deviceId ni value)
    // 2. Envoyer des données capteur (payload avec deviceId, apiKey, value)
    const methodRaw = req.method;
    const methodStr = String(methodRaw || '').trim().toUpperCase();
    const methodCode = typeof methodRaw === 'number' ? methodRaw : null;
    const isPOST = methodStr === 'POST' || methodCode === 2;
    
    if (isPOST) {
      // Vérifier si c'est une requête pour récupérer les paramètres (pas d'envoi de données capteur)
      // On détecte ça par l'absence de deviceId et value dans le payload
      
      if (!req.payload || req.payload.length === 0) {
        errorCoAP(`Empty payload in POST request`);
        res.code = '4.00'; // Bad Request
        res.end(JSON.stringify({ error: 'Payload required' }));
        return;
      }

      // Déchiffrer le payload
      const payloadData = decryptPayload(req.payload);
      if (!payloadData) {
        errorCoAP(`Failed to decrypt payload in POST request`);
        res.code = '4.00'; // Bad Request
        res.end(JSON.stringify({ error: 'Decryption failed. Invalid or unencrypted payload.' }));
        return;
      }

      const apiKey = payloadData.apiKey;
      if (!apiKey) {
        errorCoAP(`API key missing in decrypted payload`);
        res.code = '4.01'; // Unauthorized
        res.end(JSON.stringify({ error: 'API key required in payload' }));
        return;
      }

      // Détecter le type de requête :
      // - Si l'URL contient "status" → FORCÉMENT récupération des paramètres
      // - Sinon, si le payload n'a PAS de deviceId ni value → récupération des paramètres
      // - Sinon → envoi de données capteur
      const hasDeviceId = !!payloadData.deviceId;
      const hasValue = payloadData.value !== undefined;
      const urlStr = String(req.url || '');
      const isStatusUrl = urlStr === '/status' || urlStr.includes('status');
      // Priorité à l'URL : si c'est /status, c'est toujours une requête de paramètres
      const isParameterRequest = isStatusUrl || (!hasDeviceId && !hasValue);

      logCoAP(`Request type detection`, { 
        url: req.url,
        urlStr: urlStr,
        isStatusUrl: isStatusUrl,
        hasDeviceId: hasDeviceId, 
        hasValue: hasValue,
        isParameterRequest: isParameterRequest,
        payloadKeys: Object.keys(payloadData),
      });

      // FORCER la détection si URL contient "status" (pour contourner les problèmes de cache)
      if (isStatusUrl) {
        logCoAP(`STATUS URL DETECTED - Forcing parameter request`, { url: req.url });
      }

      if (isParameterRequest) {
        // Requête pour récupérer les paramètres de l'alarme
        // Payload attendu : {"apiKey": "xxx"} uniquement (pas de deviceId, pas de value)
        logCoAP(`Parameter request detected - processing`, { url: req.url });
        
        verifyApiKey(apiKey)
          .then(async (verified) => {
            if (!verified) {
              errorCoAP(`API key verification failed for parameter request`);
              res.code = '4.01'; // Unauthorized
              res.end(JSON.stringify({ error: 'API key invalid or expired' }));
              return;
            }

            logCoAP(`Parameter request authenticated`, {
              userId: verified.userId,
              apiKeyId: verified.apiKeyId,
              url: req.url,
            });

            // Récupérer tous les paramètres
            const parameters = await getAlarmParameters(verified.userId);

            logCoAP(`Alarm parameters retrieved`, {
              alarmMode: parameters.alarm.mode,
              alarmArmed: parameters.alarm.isArmed,
              sirenActive: parameters.alarm.sirenActive,
            });

            res.code = '2.04'; // Changed (même code que pour POST)
            res.end(JSON.stringify(parameters));
          })
          .catch((err) => {
            errorCoAP(`Error during parameter request processing`, {
              error: err?.message || String(err),
              errorStack: err?.stack?.substring(0, 300),
            });
            res.code = '5.00'; // Internal Server Error
            res.end(JSON.stringify({ error: 'Internal server error' }));
          });

        return;
      }
      
      // Sinon, c'est une requête d'envoi de données capteur
      // Le payload a déjà été déchiffré plus haut, on continue avec le traitement
      
      // Extraire le deviceId depuis le payload déchiffré (apiKey déjà extrait plus haut)
      const deviceId = payloadData.deviceId;

      if (!deviceId) {
        errorCoAP(`DeviceId missing in decrypted payload`);
        res.code = '4.00'; // Bad Request
        res.end(JSON.stringify({ error: 'DeviceId missing in payload' }));
        return;
      }

      logCoAP(`Extracted from decrypted payload`, { 
      deviceId,
      apiKeyLength: apiKey.length,
      hasValue: payloadData.value !== undefined,
      hasBatteryLevel: payloadData.batteryLevel !== undefined,
    });

      // 3. Authentifier avec l'API key
      verifyApiKey(apiKey)
      .then(async (verified) => {
        if (!verified) {
          errorCoAP(`API key verification failed - key not found or expired`, { 
            apiKeyLength: apiKey.length,
            apiKeyPrefix: apiKey.substring(0, 20) + '...',
          });
          res.code = '4.01'; // Unauthorized
          res.end(JSON.stringify({ error: 'API key invalid or expired' }));
          return;
        }

        logCoAP(`Authentication successful`, { 
          userId: verified.userId, 
          apiKeyId: verified.apiKeyId,
          deviceId,
        });

        // 4. Extraire et parser les valeurs
        const parsedValue = parseFloat(String(payloadData.value));
        const parsedBattery = payloadData.batteryLevel 
          ? parseInt(String(payloadData.batteryLevel)) 
          : undefined;

        if (isNaN(parsedValue)) {
          errorCoAP(`Invalid value format`, { 
            value: payloadData.value,
            valueType: typeof payloadData.value,
          });
          res.code = '4.00'; // Bad Request
          res.end(JSON.stringify({ error: 'Invalid value format. Must be a number.' }));
          return;
        }

        logCoAP(`Updating device`, { 
          deviceId, 
          value: parsedValue, 
          batteryLevel: parsedBattery,
        });

        // 5. Mettre à jour le device
        const result = await updateDeviceValue({
          deviceId,
          userId: verified.userId,
          value: parsedValue,
          batteryLevel: parsedBattery,
        });

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
      .catch((err) => {
        // Log l'erreur avec plus de détails pour diagnostiquer
        errorCoAP(`Error during authentication or update process`, { 
          error: err?.message || String(err),
          errorStack: err?.stack?.substring(0, 300),
          deviceId: deviceId,
          apiKeyLength: apiKey?.length,
        });
        res.code = '5.00'; // Internal Server Error
        res.end(JSON.stringify({ error: 'Internal server error' }));
      });
      
      return;
    }

    // Si on arrive ici et que ce n'est pas POST, c'est une erreur
    if (!isPOST) {
      errorCoAP(`Method not allowed: ${req.method}`);
      res.code = '4.05'; // Method Not Allowed
      res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
      return;
    }
  });

  server.listen(COAP_PORT, () => {
    console.log(`📡 Secure CoAP server listening on port ${COAP_PORT} (UDP)`);
    console.log(`   Methods: GET (retrieve alarm parameters), POST (send sensor data)`);
    console.log(`   🔐 Encryption: AES-256-CBC (Base64)`);
    console.log(`   🔑 AES Secret: ${AES_SECRET.substring(0, 8)}... (${AES_SECRET.length} chars)`);
    console.log(`   📋 POST payload format: Base64-encoded encrypted JSON (IV + ciphertext)`);
    console.log(`   📋 POST JSON fields: deviceId, apiKey, value, batteryLevel`);
    console.log(`   📋 GET: Returns alarm commands (mode, isArmed, sirenActive) and zones configuration`);
    console.log(`   📋 GET auth: API key in encrypted payload (AES-256-CBC, same as POST)`);
    console.log(`   ✅ CoAP server is ready to receive encrypted requests`);
    console.log(`   ℹ️  Note: Make sure port ${COAP_PORT}/UDP is exposed in Coolify`);
    console.log(`   📝 Logs are written to database (event_logs table)`);
    logCoAP('CoAP server started', { port: COAP_PORT, encryption: 'AES-256-CBC', methods: ['GET', 'POST'] });
  });

  server.on('error', (err: any) => {
    console.error('❌ CoAP server error:', err);
    console.error('   This usually means the port is already in use or not accessible');
  });

  return server;
}
