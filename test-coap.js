// Script de test pour le serveur CoAP
const coap = require('coap');

console.log('🚀 Starting CoAP test...');
console.log('📡 Connecting to: api-preventis.stark-server.fr:5683');
console.log('');
console.log('⚠️  IMPORTANT: CoAP uses UDP protocol');
console.log('   Make sure port 5683 (UDP) is open in Coolify/Server');
console.log('   Check server logs to see if CoAP server started');
console.log('');

// Test simple pour vérifier que le serveur répond
const req = coap.request({
  hostname: 'api-preventis.stark-server.fr', // CoAP utilise UDP, pas HTTPS
  port: 5683,
  pathname: '/devices/fb2c1474-f5d3-40ac-9914-56082c4f9af3/value?apiKey=pk_live_19a3ea308078ef6f9eb61b591016e8807a873537d0f98d92d4b9e6fea95cb7ff',
  method: 'POST',
});

// Timeout après 10 secondes
const timeout = setTimeout(() => {
  console.error('❌ Timeout: No response after 10 seconds');
  console.error('   Possible issues:');
  console.error('   - CoAP server not running');
  console.error('   - Port 5683 not open (UDP)');
  console.error('   - Firewall blocking UDP traffic');
  console.error('   - Network connectivity issue');
  process.exit(1);
}, 10000);

req.on('response', (res) => {
  clearTimeout(timeout);
  console.log('✅ Response received!');
  console.log('📊 Response code:', res.code);
  console.log('📦 Response payload:', res.payload.toString());
  process.exit(0);
});

req.on('error', (err) => {
  clearTimeout(timeout);
  console.error('❌ Error:', err.message);
  console.error('   Error code:', err.code);
  console.error('   Error details:', err);
  process.exit(1);
});

// Envoyer des données de test
const payload = JSON.stringify({
  value: 25.5,
  batteryLevel: 80,
});

console.log('📤 Sending payload:', payload);
req.write(payload);
req.end();
console.log('📤 Request sent, waiting for response...');