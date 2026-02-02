// Script de test pour le serveur CoAP (local)
// Pour tester si le serveur CoAP fonctionne en local
const coap = require('coap');

console.log('🚀 Starting CoAP LOCAL test...');
console.log('📡 Connecting to: localhost:5683');
console.log('');
console.log('⚠️  Make sure the API server is running with: npm run dev');
console.log('');

// Test simple pour vérifier que le serveur répond
const req = coap.request({
  hostname: 'localhost',
  port: 5683,
  pathname: '/devices/test-device-id/value?apiKey=test-key',
  method: 'POST',
});

// Timeout après 5 secondes
const timeout = setTimeout(() => {
  console.error('❌ Timeout: No response after 5 seconds');
  console.error('   Possible issues:');
  console.error('   - CoAP server not running (check logs for "📡 CoAP server listening")');
  console.error('   - Port 5683 not available');
  process.exit(1);
}, 5000);

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
