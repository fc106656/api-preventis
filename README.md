# 🛡️ Preventis API

API REST pour le système de sécurité IoT Preventis.

## 🚀 Démarrage rapide

### Prérequis

- **Node.js** >= 18
- **MySQL** >= 8.0 (ou MariaDB >= 10.5)

### 1. Créer la base de données MySQL

```sql
CREATE DATABASE preventis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Installation des dépendances

```bash
cd api
npm install
```

### 3. Configuration

Créer un fichier `.env` à la racine du dossier `api` :

```env
# Base de données MySQL
DATABASE_URL="mysql://root:password@localhost:3306/preventis"

# Port du serveur API
PORT=3001

# Environnement
NODE_ENV=development
```

⚠️ **Remplace** `root:password` par tes identifiants MySQL !

### 4. Initialiser la base de données

```bash
# Générer le client Prisma
npm run db:generate

# Créer les tables
npm run db:push

# Remplir avec des données de test
npm run db:seed
```

### 5. Lancer le serveur

```bash
# Mode développement (avec hot reload)
npm run dev

# Mode production
npm run build
npm start
```

Le serveur sera accessible sur **http://localhost:3001**

---

## 📚 Endpoints API

### Santé
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/health` | Vérification de santé |

### Capteurs
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/sensors` | Liste tous les capteurs |
| GET | `/api/sensors?type=CO2` | Filtrer par type (CO2, INFRARED, SMOKE, TEMPERATURE) |
| GET | `/api/sensors?status=ONLINE` | Filtrer par statut (ONLINE, OFFLINE, WARNING, ALERT) |
| GET | `/api/sensors/:id` | Détail d'un capteur |
| POST | `/api/sensors` | Créer un capteur |
| PUT | `/api/sensors/:id` | Modifier un capteur |
| PUT | `/api/sensors/:id/value` | Mettre à jour la valeur (IoT) |
| DELETE | `/api/sensors/:id` | Supprimer un capteur |

### Alertes
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/alerts` | Liste toutes les alertes |
| GET | `/api/alerts?type=FIRE` | Filtrer par type (FIRE, INTRUSION, SYSTEM) |
| GET | `/api/alerts?level=CRITICAL` | Filtrer par niveau (INFO, WARNING, CRITICAL) |
| GET | `/api/alerts/active` | Alertes non acquittées |
| GET | `/api/alerts/:id` | Détail d'une alerte |
| POST | `/api/alerts` | Créer une alerte |
| PUT | `/api/alerts/:id/acknowledge` | Acquitter une alerte |
| PUT | `/api/alerts/acknowledge-all` | Acquitter toutes les alertes |
| DELETE | `/api/alerts/:id` | Supprimer une alerte |

### Zones
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/zones` | Liste toutes les zones |
| GET | `/api/zones/:id` | Détail d'une zone |
| POST | `/api/zones` | Créer une zone |
| PUT | `/api/zones/:id` | Modifier une zone |
| PUT | `/api/zones/:id/arm` | Armer/désarmer une zone |
| DELETE | `/api/zones/:id` | Supprimer une zone |

### Alarme
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/alarm` | État de l'alarme |
| PUT | `/api/alarm/mode` | Changer le mode (OFF, HOME, AWAY, NIGHT) |
| PUT | `/api/alarm/siren` | Activer/désactiver la sirène |
| POST | `/api/alarm/trigger` | Déclencher l'alarme |
| POST | `/api/alarm/reset` | Réinitialiser l'alarme |

### Statistiques
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/stats` | Statistiques globales |
| GET | `/api/stats/history` | Historique des événements |

---

## 🗄️ Base de données MySQL

### Schéma

| Table | Description |
|-------|-------------|
| `sensors` | Capteurs (CO2, IR, fumée, température) |
| `alerts` | Alertes et notifications |
| `zones` | Zones de surveillance |
| `alarm_state` | État de l'alarme (singleton) |
| `event_logs` | Historique des événements |

### Types énumérés

```
SensorType: CO2, INFRARED, SMOKE, TEMPERATURE
SensorStatus: ONLINE, OFFLINE, WARNING, ALERT
AlertType: FIRE, INTRUSION, SYSTEM
AlertLevel: INFO, WARNING, CRITICAL
AlarmMode: OFF, HOME, AWAY, NIGHT
```

### Commandes utiles

```bash
# Ouvrir Prisma Studio (interface graphique)
npm run db:studio

# Réinitialiser la base de données
npm run db:reset

# Générer une migration
npm run db:migrate
```

---

## 🔌 Exemple d'intégration IoT

### Envoyer les données d'un capteur

```bash
curl -X PUT http://localhost:3001/api/sensors/SENSOR_ID/value \
  -H "Content-Type: application/json" \
  -d '{"value": 450, "batteryLevel": 85}'
```

### Créer une alerte

```bash
curl -X POST http://localhost:3001/api/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "type": "FIRE",
    "level": "CRITICAL",
    "title": "Fumée détectée",
    "message": "Fumée détectée dans le salon",
    "location": "Salon"
  }'
```

### Changer le mode de l'alarme

```bash
curl -X PUT http://localhost:3001/api/alarm/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "AWAY"}'
```

---

## 📁 Structure du projet

```
api/
├── prisma/
│   ├── schema.prisma    # Schéma de la BDD
│   └── seed.ts          # Données initiales
├── src/
│   ├── index.ts         # Point d'entrée Express
│   ├── lib/
│   │   └── prisma.ts    # Client Prisma
│   └── routes/
│       ├── sensors.ts   # Routes capteurs
│       ├── alerts.ts    # Routes alertes
│       ├── zones.ts     # Routes zones
│       ├── alarm.ts     # Routes alarme
│       └── stats.ts     # Routes statistiques
├── .env                 # Configuration locale (à créer)
├── .env.example         # Exemple de configuration
├── package.json
└── tsconfig.json
```

---

## 🐳 Docker (optionnel)

Pour lancer MySQL avec Docker :

```bash
docker run -d \
  --name preventis-mysql \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=preventis \
  -p 3306:3306 \
  mysql:8
```

Puis configure ton `.env` :
```
DATABASE_URL="mysql://root:password@localhost:3306/preventis"
```
