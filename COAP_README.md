# Serveur CoAP - Preventis API

Le serveur CoAP permet aux capteurs IoT (ESP32, etc.) d'envoyer des données via le protocole CoAP (UDP) au lieu de HTTP.

## Configuration

- **Port par défaut**: 5683 (UDP)
- **Port configurable**: Variable d'environnement `COAP_PORT`
- **Secret AES**: Variable d'environnement `COAP_AES_SECRET` (par défaut: 'your-very-secure-password')

## Endpoint

### Mettre à jour la valeur d'un device

**Méthode**: `POST`  
**URL**: `/value` (ou n'importe quelle route)  
**Authentification**: API Key (dans le payload encrypté)

#### Payload

Le payload **doit être encrypté avec AES-256-CBC** et encodé en Base64. Le JSON déchiffré doit contenir :

```json
{
  "deviceId": "device-uuid",
  "apiKey": "YOUR_API_KEY",
  "value": 23.5,
  "batteryLevel": 80
}
```

**Champs du payload (après déchiffrement)** :
- `deviceId` (requis): ID du device (UUID)
- `apiKey` (requis): API key pour l'authentification
- `value` (requis): La valeur du capteur (nombre)
- `batteryLevel` (optionnel): Niveau de batterie en pourcentage (0-100)

#### Codes de réponse CoAP

- `2.04 Changed`: Succès, device mis à jour
- `4.00 Bad Request`: Données invalides (déchiffrement échoué, JSON invalide, champ manquant)
- `4.01 Unauthorized`: API key manquante ou invalide
- `4.04 Not Found`: Device non trouvé
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

## Test

⚠️ **Note** : Les tests nécessitent de chiffrer le payload avec AES-256-CBC. Utilisez les clients Python fournis (`emeteur.py` ou `emeteur_standard.py`) qui gèrent automatiquement le chiffrement AES.

## Chiffrement AES-256-CBC

Le serveur utilise **AES-256-CBC** pour déchiffrer les payloads. Tous les payloads doivent être encryptés avec la même clé secrète.

### Configuration du secret AES

Le serveur dérive une clé AES-256 (32 bytes) depuis un secret via SHA-256 :

```env
COAP_AES_SECRET=your-very-secure-password
```

⚠️ **Important** : 
- Utilisez le **même secret** que celui configuré dans vos clients IoT (ESP32, etc.)
- En production, définissez `COAP_AES_SECRET` comme variable d'environnement dans Coolify
- Le secret est hashé avec SHA-256 pour obtenir une clé de 32 bytes (compatible avec MicroPython's hashlib.sha256)

### Format de chiffrement

- **Algorithme**: AES-256-CBC
- **Padding**: PKCS7 (géré automatiquement)
- **Format**: Base64 string contenant `IV (16 bytes) + données encryptées`
- **Encodage**: Le payload complet (IV + ciphertext) est encodé en Base64 avant envoi

**Processus de chiffrement (côté client)** :
1. Générer un IV aléatoire de 16 bytes
2. Chiffrer le JSON avec AES-256-CBC (IV + clé dérivée via SHA-256 du secret)
3. Concaténer IV + ciphertext
4. Encoder le tout en Base64
5. Envoyer la chaîne Base64 dans le payload CoAP

**Processus de déchiffrement (côté serveur)** :
1. Décoder le payload Base64
2. Extraire l'IV (16 premiers bytes)
3. Déchiffrer le reste avec AES-256-CBC
4. Parser le JSON résultant

## Notes importantes

- Le serveur CoAP démarre automatiquement avec l'API HTTP
- Les deux serveurs (HTTP et CoAP) partagent la même logique métier
- Les alertes sont créées automatiquement si un seuil est dépassé
- Le statut du device est mis à jour automatiquement selon la valeur
- **Tous les payloads doivent être encryptés avec AES-256-CBC** (pas de JSON clair)
- Le `deviceId` et l'`apiKey` doivent être dans le payload encrypté
- Les logs sont écrits dans la base de données (`event_logs` table)
