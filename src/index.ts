import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Routes
import authRoutes from './routes/auth';
import gatewayRoutes from './routes/gateways';
import deviceRoutes from './routes/devices';
import sensorRoutes from './routes/sensors';
import alertRoutes from './routes/alerts';
import zoneRoutes from './routes/zones';
import alarmRoutes from './routes/alarm';
import statsRoutes from './routes/stats';
import logsRoutes from './routes/logs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialiser la base de données au démarrage (avant de démarrer le serveur)
(async () => {
  try {
    console.log('🔧 Initializing database...');
    const initializeDatabase = (await import('./db-init')).default;
    const success = await initializeDatabase();
    if (success) {
      console.log('✅ Database initialization completed');
    } else {
      console.warn('⚠️  Database initialization had issues, but continuing...');
    }
  } catch (error) {
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
app.use(cors(corsOptions));
app.use(express.json());

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/gateways', gatewayRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/alarm', alarmRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/logs', logsRoutes);

// Route de santé
app.get('/api/health', async (req, res) => {
  try {
    // Test de connexion à la base de données
    const prisma = (await import('./lib/prisma')).default;
    await prisma.$queryRaw`SELECT 1`;
    
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Preventis API',
      database: 'connected',
  });
  } catch (error: any) {
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
      } catch (e) {
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
      logs: '/api/logs',
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
    console.log('🔧 Initializing CoAP server...');
    const { createCoAPServer } = await import('./coap-server');
    const coapServer = createCoAPServer();
    console.log('✅ CoAP server initialization completed');
  } catch (error: any) {
    console.error('❌ Failed to start CoAP server:', error);
    console.error('   Error details:', error?.message, error?.stack);
    console.warn('⚠️  CoAP server will not be available, but HTTP API will continue to work');
  }
})();

export default app;
