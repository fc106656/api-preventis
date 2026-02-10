"""
Client Python pour tester la récupération des paramètres de l'alarme via CoAP
Utilise POST avec payload encrypté AES-256-CBC

Installation:
  pip install aiocoap cryptography

Usage:
  python test_coap_parameters.py
"""
import asyncio
import json
import base64
import hashlib
import secrets
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend
from aiocoap import Context, Message, POST


class CoAPParameterClient:
    def __init__(self, server_host, server_port=5683, api_key=None, aes_secret='Password'):
        self.server_host = server_host
        self.server_port = server_port
        self.api_key = api_key
        self.aes_secret = aes_secret
        # Dériver la clé AES-256 depuis le secret (compatible avec Node.js)
        self.encryption_key = hashlib.sha256(aes_secret.encode('utf-8')).digest()

    def encrypt_payload(self, data: dict) -> str:
        """
        Chiffre un payload JSON avec AES-256-CBC et l'encode en Base64
        Format: Base64(IV (16 bytes) + ciphertext)
        """
        # 1. Convertir le dict en JSON string
        json_str = json.dumps(data)
        json_bytes = json_str.encode('utf-8')

        # 2. Générer un IV aléatoire de 16 bytes
        iv = secrets.token_bytes(16)

        # 3. Créer le cipher AES-256-CBC
        cipher = Cipher(
            algorithms.AES(self.encryption_key),
            modes.CBC(iv),
            backend=default_backend()
        )
        encryptor = cipher.encryptor()

        # 4. Padding PKCS7 (pad à 16 bytes)
        padder = padding.PKCS7(128).padder()  # 128 bits = 16 bytes
        padded_data = padder.update(json_bytes) + padder.finalize()

        # 5. Chiffrer
        ciphertext = encryptor.update(padded_data) + encryptor.finalize()

        # 6. Concaténer IV + ciphertext
        combined = iv + ciphertext

        # 7. Encoder en Base64
        base64_encoded = base64.b64encode(combined).decode('utf-8')

        return base64_encoded

    async def get_alarm_parameters(self):
        """
        Récupère les paramètres de l'alarme depuis le serveur CoAP
        POST /status avec payload encrypté: {"apiKey": "xxx"}
        """
        try:
            # 1. Préparer le payload JSON (juste l'API key, pas de deviceId ni value)
            payload_data = {
                "apiKey": self.api_key
            }

            print(f"📋 Payload JSON (avant chiffrement):")
            print(json.dumps(payload_data, indent=2))

            # 2. Chiffrer le payload
            encrypted_payload = self.encrypt_payload(payload_data)
            print(f"\n🔐 Payload chiffré (Base64, {len(encrypted_payload)} chars)")
            print(f"   Preview: {encrypted_payload[:50]}...")

            # 3. Créer le contexte CoAP
            context = await Context.create_client_context()

            # 4. Construire l'URI
            uri = f"coap://{self.server_host}:{self.server_port}/status"
            print(f"\n📤 Envoi de la requête CoAP...")
            print(f"   URI: {uri}")
            print(f"   Méthode: POST")
            print(f"   Endpoint: /status")

            # 5. Créer et envoyer la requête
            request = Message(
                code=POST,
                uri=uri,
                payload=encrypted_payload.encode('utf-8')
            )

            print(f"   Payload length: {len(encrypted_payload)} bytes")
            print(f"   ⏳ Envoi en cours...")

            response = await context.request(request).response

            print(f"\n✅ Réponse reçue!")
            print(f"   Code: {response.code}")

            # 6. Parser la réponse
            if response.payload:
                response_text = response.payload.decode('utf-8')
                print(f"   Payload length: {len(response_text)} bytes")
                print(f"\n📥 Réponse JSON:")
                try:
                    response_json = json.loads(response_text)
                    print(json.dumps(response_json, indent=2))
                    
                    # Afficher les paramètres de manière lisible
                    if 'alarm' in response_json:
                        alarm = response_json['alarm']
                        print(f"\n📊 Paramètres de l'alarme:")
                        print(f"   Mode: {alarm.get('mode')}")
                        print(f"   Armée: {alarm.get('isArmed')}")
                        print(f"   Sirène active: {alarm.get('sirenActive')}")
                    
                    await context.shutdown()
                    return response_json
                except json.JSONDecodeError:
                    print(f"   (Texte brut): {response_text}")
                    await context.shutdown()
                    return response_text
            else:
                print(f"   (Pas de payload)")
                await context.shutdown()
                return None

        except Exception as e:
            print(f"\n❌ Erreur: {e}")
            import traceback
            traceback.print_exc()
            return None


async def main():
    # Configuration
    API_KEY = "pk_live_26c15ab004e27060c55ee9d6b07c5038b56250ccaebb2b2216058a558350bf0f"
    SERVER_IP = "152.228.129.40"  # IP du serveur CoAP
    SERVER_PORT = 5683
    AES_SECRET = "Password"  # Doit correspondre à COAP_AES_SECRET du serveur

    print("=" * 60)
    print("🧪 Test Client CoAP - Récupération des paramètres")
    print("=" * 60)
    print(f"🌐 Serveur: {SERVER_IP}:{SERVER_PORT}")
    print(f"🔑 API Key: {API_KEY[:20]}...")
    print(f"🔐 AES Secret: {AES_SECRET}")
    print("=" * 60)

    client = CoAPParameterClient(
        server_host=SERVER_IP,
        server_port=SERVER_PORT,
        api_key=API_KEY,
        aes_secret=AES_SECRET
    )

    print("\n📡 Récupération des paramètres de l'alarme...\n")
    result = await client.get_alarm_parameters()

    print("\n" + "=" * 60)
    if result:
        print("✅ Succès!")
        if isinstance(result, dict) and 'alarm' in result:
            alarm = result['alarm']
            print(f"\n📋 Résumé:")
            print(f"   • Mode: {alarm.get('mode')}")
            print(f"   • Armée: {'Oui' if alarm.get('isArmed') else 'Non'}")
            print(f"   • Sirène: {'Active' if alarm.get('sirenActive') else 'Inactive'}")
    else:
        print("❌ Échec")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
