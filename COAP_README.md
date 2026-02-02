# Serveur CoAP - Preventis API

Le serveur CoAP permet aux capteurs IoT (ESP32, etc.) d'envoyer des données via le protocole CoAP (UDP) au lieu de HTTP.

## Configuration

- **Port par défaut**: 5683 (UDP)
- **Port configurable**: Variable d'environnement `COAP_PORT`

## Endpoint

### Mettre à jour la valeur d'un device

**Méthode**: `POST`  
**URL**: `/devices/{deviceId}/value`  
**Authentification**: API Key (requis)

#### Méthodes d'authentification

1. **Query string** (recommandé):
   ```
   POST coap://api-preventis.stark-server.fr:5683/devices/{deviceId}/value?apiKey=YOUR_API_KEY
   ```

2. **Dans le payload JSON**:
   ```json
   {
     "apiKey": "YOUR_API_KEY",
     "value": 23.5,
     "batteryLevel": 80
   }
   ```

#### Payload

```json
{
  "value": 23.5,
  "batteryLevel": 80
}
```

- `value` (requis): La valeur du capteur (nombre)
- `batteryLevel` (optionnel): Niveau de batterie en pourcentage (0-100)

#### Codes de réponse CoAP

- `2.04 Changed`: Succès, device mis à jour
- `4.00 Bad Request`: Données invalides (JSON invalide, champ manquant)
- `4.01 Unauthorized`: API key manquante ou invalide
- `4.04 Not Found`: Device non trouvé ou route invalide
- `4.05 Method Not Allowed`: Méthode HTTP non supportée (seul POST est supporté)
- `5.00 Internal Server Error`: Erreur serveur

#### Exemple de réponse (succès)

```json
{
  "success": true,
  "device": {
    "id": "device-uuid",
    "value": 23.5,
    "status": "ONLINE"
  }
}
```

## Test avec coap-cli

```bash
# Installer coap-cli globalement
npm install -g coap-cli

# Test avec query string
echo '{"value": 25.5, "batteryLevel": 80}' | coap post "coap://localhost:5683/devices/{deviceId}/value?apiKey=YOUR_API_KEY"
```

## Test avec Node.js

```javascript
const coap = require('coap');

const req = coap.request({
  hostname: 'localhost',
  port: 5683,
  pathname: '/devices/{deviceId}/value?apiKey=YOUR_API_KEY',
  method: 'POST',
});

req.on('response', (res) => {
  console.log('Response code:', res.code);
  console.log('Response:', res.payload.toString());
});

req.write(JSON.stringify({
  value: 25.5,
  batteryLevel: 80,
}));

req.end();
```

## Notes importantes

- Le serveur CoAP démarre automatiquement avec l'API HTTP
- Les deux serveurs (HTTP et CoAP) partagent la même logique métier
- Les alertes sont créées automatiquement si un seuil est dépassé
- Le statut du device est mis à jour automatiquement selon la valeur
