# Commandes pour vérifier le port UDP 5683

## Sur Windows (votre machine locale)

### Option 1 : PowerShell (Test-NetConnection)
```powershell
Test-NetConnection -ComputerName api-preventis.stark-server.fr -Port 5683 -InformationLevel Detailed
```

**Note** : `Test-NetConnection` teste principalement TCP. Pour UDP, utilisez les autres méthodes.

### Option 2 : nmap (si installé)
```powershell
nmap -sU -p 5683 api-preventis.stark-server.fr
```

### Option 3 : Test avec Node.js (le plus fiable)
```javascript
// Créer un fichier check-udp.js
const dgram = require('dgram');
const client = dgram.createSocket('udp4');

const serverHost = 'api-preventis.stark-server.fr';
const serverPort = 5683;

// Envoyer un paquet de test
const message = Buffer.from('test');
client.send(message, serverPort, serverHost, (err) => {
  if (err) {
    console.error('❌ Erreur:', err.message);
    console.log('   Le port est probablement fermé ou inaccessible');
  } else {
    console.log('✅ Paquet envoyé avec succès');
    console.log('   Le port semble accessible (mais pas de réponse garantie en UDP)');
  }
  client.close();
});

// Timeout après 5 secondes
setTimeout(() => {
  console.log('⏱️  Timeout: Pas de réponse (normal en UDP sans serveur qui répond)');
  client.close();
}, 5000);
```

## Sur le serveur Linux (si vous y avez accès)

### Option 1 : netstat
```bash
sudo netstat -ulnp | grep 5683
```

### Option 2 : ss (plus moderne)
```bash
sudo ss -ulnp | grep 5683
```

### Option 3 : lsof
```bash
sudo lsof -i :5683
```

### Option 4 : Vérifier le firewall
```bash
sudo ufw status | grep 5683
# Ou
sudo iptables -L -n | grep 5683
```

### Option 5 : Test depuis le serveur
```bash
# Depuis le serveur, tester si le port écoute
sudo netstat -ulnp | grep 5683
# Devrait afficher quelque chose comme :
# udp        0      0 0.0.0.0:5683            0.0.0.0:*                           12345/node
```

## Test depuis l'extérieur (votre machine)

### Avec telnet (ne fonctionne pas pour UDP)
```bash
# Ne fonctionne pas pour UDP, seulement TCP
telnet api-preventis.stark-server.fr 5683
```

### Avec nc (netcat) - si installé
```bash
# Linux/Mac
nc -u -v api-preventis.stark-server.fr 5683

# Windows (si installé)
nc -u -v api-preventis.stark-server.fr 5683
```

### Le plus simple : Utiliser le script de test CoAP
```bash
node test-coap.js
```

Si vous obtenez une réponse, le port est ouvert et le serveur fonctionne !
