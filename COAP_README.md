# Serveur CoAP - Preventis API

Le serveur CoAP permet aux capteurs IoT (ESP32, etc.) d'envoyer des donnÃ©es via le protocole CoAP (UDP) au lieu de HTTP.

## Configuration

- **Port par dÃ©faut**: 5683 (UDP)
- **Port configurable**: Variable d'environnement COAP_PORT
- **ClÃ© privÃ©e RSA**: Fichier private_key.pem ou variable d'environnement COAP_PRIVATE_KEY

## Endpoint

### Mettre Ã  jour la valeur d'un device

**MÃ©thode**: POST  
**URL**: /value (ou n'importe quelle route)  
**Authentification**: API Key (dans le payload encryptÃ©)

#### Payload

Le payload **doit Ãªtre encryptÃ© avec RSA** (clÃ© publique du serveur). Le JSON dÃ©chiffrÃ© doit contenir :

`json
{
  "deviceId": "device-uuid",
  "apiKey": "YOUR_API_KEY",
  "value": 23.5,
  "batteryLevel": 80
}
`

**Champs du payload (aprÃ¨s dÃ©chiffrement)** :
- deviceId (requis): ID du device (UUID)
- piKey (requis): API key pour l'authentification
- alue (requis): La valeur du capteur (nombre)
- atteryLevel (optionnel): Niveau de batterie en pourcentage (0-100)

#### Codes de rÃ©ponse CoAP

- 2.04 Changed: SuccÃ¨s, device mis Ã  jour
- 4.00 Bad Request: DonnÃ©es invalides (dÃ©chiffrement Ã©chouÃ©, JSON invalide, champ manquant)
- 4.01 Unauthorized: API key manquante ou invalide
- 4.04 Not Found: Device non trouvÃ©
- 4.05 Method Not Allowed: MÃ©thode HTTP non supportÃ©e (seul POST est supportÃ©)
- 5.00 Internal Server Error: Erreur serveur

#### Exemple de rÃ©ponse (succÃ¨s)

`json
{
  "success": true,
  "device": {
    "id": "device-uuid",
    "value": 23.5,
    "status": "ONLINE"
  }
}
`

## Test

âš ï¸ **Note** : Les tests nÃ©cessitent de chiffrer le payload avec la clÃ© publique RSA du serveur. Utilisez les clients Python fournis (emeteur.py ou emeteur_standard.py) qui gÃ¨rent automatiquement le chiffrement RSA.

## Chiffrement RSA

Le serveur utilise **RSA** pour dÃ©chiffrer les payloads. Tous les payloads doivent Ãªtre encryptÃ©s avec la clÃ© publique RSA du serveur.

### Configuration de la clÃ© privÃ©e

Le serveur charge la clÃ© privÃ©e RSA de l'une des maniÃ¨res suivantes (par ordre de prioritÃ©) :

1. **Variable d'environnement COAP_PRIVATE_KEY** (recommandÃ© pour la production) :
   `env
   COAP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
   `

2. **Fichier via variable d'environnement COAP_PRIVATE_KEY_PATH** :
   `env
   COAP_PRIVATE_KEY_PATH=/path/to/private_key.pem
   `

3. **Fichier par dÃ©faut** : private_key.pem dans le rÃ©pertoire pi/

### Format de chiffrement

- **Algorithme**: RSA
- **Padding**: PKCS1 (RSA_PKCS1_PADDING)
- **Format**: Payload binaire encryptÃ© avec la clÃ© publique RSA

âš ï¸ **Important** : 
- La clÃ© privÃ©e ne doit **jamais** Ãªtre commitÃ©e dans Git (dÃ©jÃ  dans .gitignore)
- En production, utilisez COAP_PRIVATE_KEY comme variable d'environnement dans Coolify
- Les clients doivent utiliser la **clÃ© publique** correspondante pour chiffrer leurs payloads

## Notes importantes

- Le serveur CoAP dÃ©marre automatiquement avec l'API HTTP
- Les deux serveurs (HTTP et CoAP) partagent la mÃªme logique mÃ©tier
- Les alertes sont crÃ©Ã©es automatiquement si un seuil est dÃ©passÃ©
- Le statut du device est mis Ã  jour automatiquement selon la valeur
- **Tous les payloads doivent Ãªtre encryptÃ©s avec RSA** (pas de JSON clair)
- Le deviceId et l'piKey doivent Ãªtre dans le payload encryptÃ©
- Les logs sont Ã©crits dans la base de donnÃ©es (event_logs table)
