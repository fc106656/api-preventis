# Configuration CoAP dans Coolify

## ✅ Oui, HTTP et CoAP peuvent coexister !

Un container Docker peut écouter sur plusieurs ports simultanément :
- **HTTP (TCP)** : Port 3001 (ou celui configuré)
- **CoAP (UDP)** : Port 5683

Ce sont des protocoles différents (TCP vs UDP) donc pas de conflit.

## Configuration dans Coolify

### 1. Vérifier que le serveur CoAP démarre

Dans les logs Coolify de votre API, cherchez :
```
📡 CoAP server listening on port 5683 (UDP)
✅ CoAP server is ready to receive requests
```

Si vous ne voyez pas ce message, le serveur CoAP ne démarre pas (erreur au démarrage).

### 2. Exposer le port UDP dans Coolify

Dans la configuration de votre application API dans Coolify :

1. **Network Ports** :
   - Ajouter un nouveau port mapping
   - **Port interne** : `5683`
   - **Port externe** : `5683` (ou autre si vous préférez)
   - **Type** : **UDP** (important !)
   - **Expose** : Oui

2. **Si Coolify ne permet pas de choisir UDP** :
   - Certaines versions de Coolify n'ont pas d'option UDP dans l'interface
   - Il faut peut-être configurer manuellement via Docker ou les variables d'environnement
   - Alternative : Utiliser HTTP à la place (fonctionne déjà)

### 3. Vérifier le firewall du serveur

Même si Coolify expose le port, le firewall du serveur peut bloquer UDP :

```bash
# Sur le serveur (si vous y avez accès)
sudo ufw status
sudo ufw allow 5683/udp
```

### 4. Test

Une fois configuré, testez avec :
```bash
node test-coap.js
```

## Alternative : Utiliser HTTP

Si UDP pose problème, l'ESP32 peut utiliser HTTP directement :

```javascript
// Au lieu de CoAP, utiliser HTTP
POST https://api-preventis.stark-server.fr/api/devices/{deviceId}/value
Headers: {
  "X-API-Key": "YOUR_API_KEY",
  "Content-Type": "application/json"
}
Body: {
  "value": 25.5,
  "batteryLevel": 80
}
```

L'endpoint HTTP fonctionne déjà et utilise la même logique métier que CoAP.

## Vérification rapide

1. ✅ Le serveur CoAP démarre-t-il ? (vérifier les logs)
2. ✅ Le port 5683/UDP est-il exposé dans Coolify ?
3. ✅ Le firewall autorise-t-il UDP 5683 ?

Si les 3 sont OK, ça devrait fonctionner ! 🚀
