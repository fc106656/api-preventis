// Script de test pour le serveur CoAP
const coap = require('coap');

// Test simple pour vérifier que le serveur répond
const req = coap.request({
  hostname: 'https://api.preventis.stark-server.fr',
  port: 5683,
  pathname: '/devices/fb2c1474-f5d3-40ac-9914-56082c4f9af3/value?apiKey=pk_live_19a3ea308078ef6f9eb61b591016e8807a873537d0f98d92d4b9e6fea95cb7ff',
  method: 'POST',
});

req.on('response', (res) => {
  console.log('Response code:', res.code);
  console.log('Response payload:', res.payload.toString());
  process.exit(0);
});

req.on('error', (err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

// Envoyer des données de test
req.write(JSON.stringify({
  value: 25.5,
  batteryLevel: 80,
}));

req.end();
