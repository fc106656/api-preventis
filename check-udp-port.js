// Script pour vérifier si le port UDP 5683 est accessible
const dgram = require('dgram');

const serverHost = 'api-preventis.stark-server.fr';
const serverPort = 5683;

console.log('🔍 Vérification du port UDP 5683...');
console.log(`📡 Cible: ${serverHost}:${serverPort}`);
console.log('');

const client = dgram.createSocket('udp4');

// Envoyer un paquet de test
const message = Buffer.from(JSON.stringify({ test: true }));
client.send(message, serverPort, serverHost, (err) => {
  if (err) {
    console.error('❌ Erreur lors de l\'envoi:', err.message);
    console.error('   Le port est probablement fermé ou inaccessible');
    console.error('   Vérifiez:');
    console.error('   - Le port UDP 5683 est-il exposé dans Coolify ?');
    console.error('   - Le firewall autorise-t-il UDP 5683 ?');
    process.exit(1);
  } else {
    console.log('✅ Paquet UDP envoyé avec succès');
    console.log('   Le port semble accessible depuis votre machine');
    console.log('   ⚠️  Note: UDP est "fire and forget", pas de réponse garantie');
    console.log('   Pour tester vraiment, utilisez: node test-coap.js');
  }
});

// Écouter une réponse (peu probable en UDP sans serveur qui répond)
client.on('message', (msg, rinfo) => {
  console.log('📨 Réponse reçue:', msg.toString());
  console.log('   Depuis:', rinfo.address + ':' + rinfo.port);
  client.close();
  process.exit(0);
});

// Timeout après 3 secondes
setTimeout(() => {
  console.log('⏱️  Timeout: Pas de réponse (normal en UDP)');
  console.log('   Le port est peut-être ouvert mais le serveur ne répond pas aux tests');
  console.log('   Utilisez "node test-coap.js" pour un vrai test avec le serveur CoAP');
  client.close();
  process.exit(0);
}, 3000);

client.on('error', (err) => {
  console.error('❌ Erreur socket:', err.message);
  process.exit(1);
});
