import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Routes
import sensorRoutes from './routes/sensors';
import alertRoutes from './routes/alerts';
import zoneRoutes from './routes/zones';
import alarmRoutes from './routes/alarm';
import statsRoutes from './routes/stats';

dotenv.config();

// Initialiser la base de données au démarrage
(async () => {
  try {
    const initializeDatabase = (await import('./db-init')).default;
    await initializeDatabase();
  } catch (error) {
    console.error('Failed to initialize database:', error);
    // Continue le démarrage même si l'init échoue
    // (les requêtes testeront la connexion)
  }
})();

const app = express();
const PORT = process.env.PORT || 3001;

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
app.use('/api/sensors', sensorRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/alarm', alarmRoutes);
app.use('/api/stats', statsRoutes);

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
      sensors: '/api/sensors',
      alerts: '/api/alerts',
      zones: '/api/zones',
      alarm: '/api/alarm',
      stats: '/api/stats',
    },
  });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Preventis API running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

export default app;
