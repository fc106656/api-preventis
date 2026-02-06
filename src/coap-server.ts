// Serveur CoAP pour Preventis
// Reçoit les données des capteurs via CoAP (UDP port 5683)
import * as coap from 'coap';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { verifyApiKey } from './lib/auth';
import { updateDeviceValue } from './lib/deviceService';
import prisma from './lib/prisma';

const COAP_PORT = parseInt(process.env.COAP_PORT || '5683', 10);

// Charger la clé privée RSA pour le déchiffrement
// Supporte: fichier via COAP_PRIVATE_KEY_PATH ou clé directe via COAP_PRIVATE_KEY
let PRIVATE_KEY: string;
try {
  const keyPath = process.env.COAP_PRIVATE_KEY_PATH || path.join(__dirname, '../private_key.pem');
  
  if (process.env.COAP_PRIVATE_KEY) {
    // Clé fournie directement via variable d'environnement
    PRIVATE_KEY = process.env.COAP_PRIVATE_KEY;
    console.log('🔑 Using RSA private key from COAP_PRIVATE_KEY environment variable');
  } else if (fs.existsSync(keyPath)) {
    // Clé depuis un fichier
    PRIVATE_KEY = fs.readFileSync(keyPath, 'utf8');
    console.log(`🔑 Loaded RSA private key from: ${keyPath}`);
  } else {
    throw new Error(`Private key not found at ${keyPath} and COAP_PRIVATE_KEY not set`);
  }
} catch (error: any) {
  console.error('❌ Failed to load RSA private key:', error.message);
  console.error('   Set COAP_PRIVATE_KEY_PATH or COAP_PRIVATE_KEY environment variable');
  throw error;
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
  method: string;
  payload: Buffer;
};

type CoAPResponse = coap.OutgoingMessage;


/**
 * Déchiffre un payload encrypté avec RSA
 * Utilise la clé privée RSA pour déchiffrer le payload
 */
function decryptPayload(encryptedBuffer: Buffer): any {
  try {
    if (!encryptedBuffer || encryptedBuffer.length === 0) {
      errorCoAP(`Empty payload received`);
      return null;
    }

    logCoAP(`Attempting RSA decryption`, { payloadLength: encryptedBuffer.length });

    // Déchiffrer avec la clé privée RSA
    const decrypted = crypto.privateDecrypt(
      {
        key: PRIVATE_KEY,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      encryptedBuffer
    );

    // Parser le JSON déchiffré
    const payloadData = JSON.parse(decrypted.toString('utf8'));
    logCoAP(`Payload decrypted and parsed successfully`, { 
      keys: Object.keys(payloadData),
      hasDeviceId: !!payloadData.deviceId,
      hasApiKey: !!payloadData.apiKey,
    });

    return payloadData;
  } catch (error: any) {
    errorCoAP(`RSA decryption failed`, { 
      error: error.message,
      payloadLength: encryptedBuffer?.length || 0,
    });
    return null;
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
    });

    // Seulement POST est supporté
    if (req.method !== 'POST') {
      errorCoAP(`Method not allowed: ${req.method}`);
      res.code = '4.05'; // Method Not Allowed
      res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
      return;
    }

    // 1. Déchiffrer le payload d'abord (RSA)
    const payloadData = decryptPayload(req.payload);

    if (!payloadData) {
      errorCoAP(`Failed to decrypt payload or payload is unreadable`);
      res.code = '4.00'; // Bad Request
      res.end(JSON.stringify({ error: 'Decryption failed. Invalid or unencrypted payload.' }));
      return;
    }

    // 2. Extraire l'API key et le deviceId depuis le payload déchiffré
    const apiKey = payloadData.apiKey;
    const deviceId = payloadData.deviceId;

    if (!apiKey) {
      errorCoAP(`API key missing in decrypted payload`);
      res.code = '4.01'; // Unauthorized
      res.end(JSON.stringify({ error: 'API key missing in payload' }));
      return;
    }

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
          errorCoAP(`API key verification failed`, { 
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
        errorCoAP(`Error during authentication or update`, err);
        res.code = '5.00'; // Internal Server Error
        res.end(JSON.stringify({ error: 'Internal server error' }));
      });
  });

  server.listen(COAP_PORT, () => {
    console.log(`📡 Secure CoAP server listening on port ${COAP_PORT} (UDP)`);
    console.log(`   Method: POST`);
    console.log(`   🔐 Encryption: RSA (PKCS1 padding)`);
    console.log(`   🔑 Private key: Loaded successfully`);
    console.log(`   📋 Payload format: Encrypted JSON with deviceId, apiKey, value, batteryLevel`);
    console.log(`   ✅ CoAP server is ready to receive encrypted requests`);
    console.log(`   ℹ️  Note: Make sure port ${COAP_PORT}/UDP is exposed in Coolify`);
    console.log(`   📝 Logs are written to database (event_logs table)`);
    logCoAP('CoAP server started', { port: COAP_PORT, encryption: 'RSA' });
  });

  server.on('error', (err: any) => {
    console.error('❌ CoAP server error:', err);
    console.error('   This usually means the port is already in use or not accessible');
  });

  return server;
}
