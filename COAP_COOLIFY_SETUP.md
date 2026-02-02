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
   - **Ports Exposes** : `3001, 5683` ✅ (vous l'avez déjà)
   - **Port Mappings** : Ajouter `5683:5683`
     - **Important** : Spécifier que c'est **UDP** (pas TCP)
     - Format : `5683:5683/udp` ou via l'interface si disponible

2. **Via Custom Docker Options** (si l'interface ne permet pas UDP) :
   - Ajouter dans **Custom Docker Options** :
   ```
   -p 5683:5683/udp
   ```
   - Votre configuration complète devrait être :
   ```
   --cap-add SYS_ADMIN --device=/dev/fuse --security-opt apparmor:unconfined --ulimit nofile=1024:1024 --tmpfs /run:rw,noexec,nosuid,size=65536k --hostname=myapp -p 5683:5683/udp
   ```

3. **Vérifier le firewall du serveur** :
   ```bash
   sudo ufw allow 5683/udp
   ```

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
