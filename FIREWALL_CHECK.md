# Vérification du firewall pour UDP 5683

## ✅ Le port écoute bien !

D'après votre `ss -ulnp`, le port UDP 5683 est bien ouvert :
```
UNCONN 0      0                  0.0.0.0:5683      0.0.0.0:*    users:(("docker-proxy",pid=602401,fd=4))
```

Cela signifie que Docker/Coolify a bien mappé le port.

## 🔥 Vérifier le firewall

Le problème est probablement le firewall qui bloque les connexions UDP entrantes.

### Commandes à exécuter sur le serveur :

```bash
# 1. Vérifier le statut du firewall
sudo ufw status

# 2. Si ufw est actif, autoriser UDP 5683
sudo ufw allow 5683/udp

# 3. Vérifier iptables (si ufw n'est pas utilisé)
sudo iptables -L -n | grep 5683

# 4. Autoriser dans iptables si nécessaire
sudo iptables -A INPUT -p udp --dport 5683 -j ACCEPT
sudo iptables-save
```

### Vérifier si le firewall bloque :

```bash
# Tester depuis le serveur lui-même
sudo tcpdump -i any -n udp port 5683
# Puis depuis votre machine, lancez: node test-coap.js
# Si vous voyez des paquets dans tcpdump mais pas de réponse, c'est le firewall
```

## 🧪 Test depuis le serveur

Pour vérifier que le serveur CoAP répond bien :

```bash
# Depuis le serveur, tester localhost
curl -X POST http://localhost:3001/api/health
# Devrait répondre (test HTTP)

# Pour CoAP, il faudrait un client CoAP installé sur le serveur
```

## 📝 Résumé

1. ✅ Port mappé dans Docker : `docker-proxy` écoute sur 5683
2. ❓ Firewall : Vérifier avec `sudo ufw status` et `sudo ufw allow 5683/udp`
3. ✅ Test : Relancer `node test-coap.js` après avoir ouvert le firewall
