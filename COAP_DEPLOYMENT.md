# Configuration CoAP pour le déploiement

## Problème

CoAP utilise le protocole **UDP** (pas TCP), et Coolify expose généralement des ports **TCP** par défaut.

## Solutions

### Option 1 : Exposer le port UDP dans Coolify (Recommandé)

Dans la configuration Coolify de votre API :

1. **Network Ports** :
   - Ajouter un port mapping : `5683:5683`
   - **Important** : Spécifier que c'est UDP (pas TCP)
   - Certaines versions de Coolify nécessitent une configuration manuelle pour UDP

2. **Firewall** :
   - Vérifier que le firewall du serveur autorise UDP sur le port 5683
   - Commande serveur : `sudo ufw allow 5683/udp`

### Option 2 : Utiliser un reverse proxy UDP (si Coolify ne supporte pas UDP)

Si Coolify ne supporte pas directement UDP, vous pouvez utiliser :

1. **HAProxy** ou **Nginx Stream** pour faire un proxy UDP
2. **Socat** pour créer un tunnel UDP

### Option 3 : Utiliser HTTP à la place (Solution de contournement)

Si UDP n'est pas disponible, vous pouvez toujours utiliser HTTP pour les capteurs :
- L'endpoint HTTP `/api/devices/:id/value` fonctionne déjà
- L'ESP32 peut faire des requêtes HTTP POST

## Vérification

### 1. Vérifier que le serveur CoAP démarre

Dans les logs de l'API, vous devriez voir :
```
📡 CoAP server listening on port 5683 (UDP)
   Endpoint: coap://0.0.0.0:5683/devices/{deviceId}/value
   ✅ CoAP server is ready to receive requests
```

### 2. Tester depuis le serveur

```bash
# Sur le serveur, tester en local
node test-coap-local.js
```

### 3. Tester depuis l'extérieur

```bash
# Depuis votre machine
node test-coap.js
```

## Configuration Coolify recommandée

```
Network Ports:
  - Port: 5683
  - Protocol: UDP
  - Expose: Yes
```

## Note importante

Si Coolify ne supporte pas UDP directement, vous devrez peut-être :
- Utiliser HTTP à la place (fonctionne déjà)
- Configurer un reverse proxy UDP manuellement
- Utiliser un tunnel VPN pour la communication
