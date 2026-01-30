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

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration CORS
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:8081',
    'https://preventis.clementfaux.fr',
    'http://preventis.clementfaux.fr',
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
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Preventis API',
  });
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
