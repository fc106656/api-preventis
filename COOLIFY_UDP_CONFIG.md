# Configuration UDP dans Coolify pour CoAP

## ✅ Le serveur CoAP démarre bien !

D'après vos logs, le serveur CoAP démarre correctement :
```
📡 CoAP server listening on port 5683 (UDP)
✅ CoAP server is ready to receive requests
```

## ❌ Mais le port UDP n'est pas exposé

Le problème est que Coolify expose généralement des ports **TCP** par défaut, pas UDP.

## Solution : Configurer le port UDP dans Coolify

### Option 1 : Via l'interface Coolify (si disponible)

Dans **Network Ports** de votre application :

1. **Ports Exposes** : `3001, 5683` ✅ (vous l'avez déjà)
2. **Port Mappings** : Ajouter `5683:5683` 
   - **Important** : Spécifier que c'est **UDP** (pas TCP)
   - Format : `5683:5683/udp` ou via l'interface si disponible

### Option 2 : Via Custom Docker Options

Si l'interface ne permet pas de choisir UDP, ajoutez dans **Custom Docker Options** :

```
-p 5683:5683/udp
```

Votre configuration actuelle :
```
--cap-add SYS_ADMIN --device=/dev/fuse --security-opt apparmor:unconfined --ulimit nofile=1024:1024 --tmpfs /run:rw,noexec,nosuid,size=65536k --hostname=myapp -p 5683:5683/udp
```

### Option 3 : Vérifier le firewall du serveur

Même si Coolify expose le port, le firewall du serveur peut bloquer UDP :

```bash
# Sur le serveur (si vous y avez accès)
sudo ufw status
sudo ufw allow 5683/udp
```

## Test après configuration

Une fois le port UDP configuré, testez à nouveau :
```bash
node test-coap.js
```

## Alternative : Utiliser HTTP

Si UDP pose trop de problèmes, l'ESP32 peut utiliser HTTP directement :

```javascript
// Endpoint HTTP qui fonctionne déjà
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

L'endpoint HTTP utilise la même logique métier que CoAP.
