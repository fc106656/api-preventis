"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
// Routes
const auth_1 = __importDefault(require("./routes/auth"));
const gateways_1 = __importDefault(require("./routes/gateways"));
const devices_1 = __importDefault(require("./routes/devices"));
const sensors_1 = __importDefault(require("./routes/sensors"));
const alerts_1 = __importDefault(require("./routes/alerts"));
const zones_1 = __importDefault(require("./routes/zones"));
const alarm_1 = __importDefault(require("./routes/alarm"));
const stats_1 = __importDefault(require("./routes/stats"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Initialiser la base de données au démarrage (avant de démarrer le serveur)
(async () => {
    try {
        console.log('🔧 Initializing database...');
        const initializeDatabase = (await Promise.resolve().then(() => __importStar(require('./db-init')))).default;
        const success = await initializeDatabase();
        if (success) {
            console.log('✅ Database initialization completed');
        }
        else {
            console.warn('⚠️  Database initialization had issues, but continuing...');
        }
    }
    catch (error) {
        console.error('❌ Failed to initialize database:', error);
        console.error('⚠️  API will start anyway, but database operations may fail');
        // Continue le démarrage même si l'init échoue
        // (les requêtes testeront la connexion)
    }
})();
// Configuration CORS
const corsOptions = {
    origin: [
        'http://localhost:3000',
        'http://localhost:8081',
        'https://preventis.clementfaux.fr',
        'http://preventis.clementfaux.fr',
        'https://preventis.stark-server.fr',
        'http://preventis.stark-server.fr',
    ],
    credentials: true,
};
// Middleware
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
// Routes API
app.use('/api/auth', auth_1.default);
app.use('/api/gateways', gateways_1.default);
app.use('/api/devices', devices_1.default);
app.use('/api/sensors', sensors_1.default);
app.use('/api/alerts', alerts_1.default);
app.use('/api/zones', zones_1.default);
app.use('/api/alarm', alarm_1.default);
app.use('/api/stats', stats_1.default);
// Route de santé
app.get('/api/health', async (req, res) => {
    try {
        // Test de connexion à la base de données
        const prisma = (await Promise.resolve().then(() => __importStar(require('./lib/prisma')))).default;
        await prisma.$queryRaw `SELECT 1`;
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'Preventis API',
            database: 'connected',
        });
    }
    catch (error) {
        console.error('Database connection error:', error);
        console.error('Error code:', error?.code);
        console.error('Error message:', error?.message);
        console.error('DATABASE_URL present:', !!process.env.DATABASE_URL);
        // Afficher des infos sur la DATABASE_URL sans exposer le mot de passe
        if (process.env.DATABASE_URL) {
            try {
                const dbUrl = new URL(process.env.DATABASE_URL);
                console.error('Database config:', {
                    protocol: dbUrl.protocol,
                    hostname: dbUrl.hostname,
                    port: dbUrl.port,
                    pathname: dbUrl.pathname,
                    username: dbUrl.username,
                });
            }
            catch (e) {
                console.error('Invalid DATABASE_URL format');
            }
        }
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            service: 'Preventis API',
            database: 'disconnected',
            error: error?.message || 'Database connection failed',
            code: error?.code,
            hint: !process.env.DATABASE_URL
                ? 'DATABASE_URL environment variable is not set'
                : error?.code === 'ECONNREFUSED'
                    ? 'Cannot connect to database server. Check hostname and port.'
                    : error?.code === 'P1000'
                        ? 'Authentication failed. Check username and password.'
                        : error?.code === 'P1001'
                            ? 'Cannot reach database server. Check network connectivity.'
                            : error?.code === 'P1003'
                                ? 'Database does not exist. Create it first.'
                                : 'Check database configuration and network connectivity',
        });
    }
});
// Route racine
app.get('/', (req, res) => {
    res.json({
        message: 'Bienvenue sur l\'API Preventis',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            sensors: '/api/sensors',
            alerts: '/api/alerts',
            zones: '/api/zones',
            alarm: '/api/alarm',
            stats: '/api/stats',
            gateways: '/api/gateways',
            devices: '/api/devices',
        },
    });
});
// Démarrage du serveur HTTP
app.listen(PORT, () => {
    console.log(`🚀 Preventis API (HTTP) running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
// Démarrage du serveur CoAP
(async () => {
    try {
        const { createCoAPServer } = await Promise.resolve().then(() => __importStar(require('./coap-server')));
        createCoAPServer();
    }
    catch (error) {
        console.error('❌ Failed to start CoAP server:', error);
        console.warn('⚠️  CoAP server will not be available, but HTTP API will continue to work');
    }
})();
exports.default = app;
//# sourceMappingURL=index.js.map