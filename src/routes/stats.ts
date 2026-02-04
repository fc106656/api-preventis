import { Router } from 'express';
import { SensorStatus, AlertType, AlertLevel } from '@prisma/client';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/stats
router.get('/', async (req, res) => {
  try {
    const sensors = await prisma.sensor.findMany();
    const sensorStats = {
      total: sensors.length,
      online: sensors.filter((s) => s.status === SensorStatus.ONLINE).length,
      offline: sensors.filter((s) => s.status === SensorStatus.OFFLINE).length,
      warning: sensors.filter((s) => s.status === SensorStatus.WARNING).length,
      alert: sensors.filter((s) => s.status === SensorStatus.ALERT).length,
    };

    const alerts = await prisma.alert.findMany();
    const alertStats = {
      total: alerts.length,
      active: alerts.filter((a) => !a.acknowledged).length,
      acknowledged: alerts.filter((a) => a.acknowledged).length,
      byType: {
        fire: alerts.filter((a) => a.type === AlertType.FIRE).length,
        intrusion: alerts.filter((a) => a.type === AlertType.INTRUSION).length,
        system: alerts.filter((a) => a.type === AlertType.SYSTEM).length,
      },
    };

    const zones = await prisma.zone.findMany();
    const zoneStats = {
      total: zones.length,
      armed: zones.filter((z) => z.isArmed).length,
      disarmed: zones.filter((z) => !z.isArmed).length,
    };

    const alarmState = await prisma.alarmState.findUnique({
      where: { id: 'main' },
    });

    const lastIncident = await prisma.alert.findFirst({
      where: { level: AlertLevel.CRITICAL },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      sensors: sensorStats,
      alerts: alertStats,
      zones: zoneStats,
      alarm: alarmState,
      lastIncident: lastIncident?.createdAt || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// GET /api/stats/history
router.get('/history', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const limit = parseInt(req.query.limit as string) || 100;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const events = await prisma.eventLog.findMany({
      where: { createdAt: { gte: startDate } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(events);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// GET /api/stats/coap-logs - Logs CoAP spécifiques
router.get('/coap-logs', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 1;
    const limit = parseInt(req.query.limit as string) || 200;
    const level = req.query.level as string | undefined; // 'INFO' ou 'ERROR'

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where: any = {
      createdAt: { gte: startDate },
      type: {
        startsWith: 'COAP_',
      },
    };

    if (level) {
      where.type = `COAP_${level.toUpperCase()}`;
    }

    const logs = await prisma.eventLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(logs);
  } catch (error) {
    console.error('Error fetching CoAP logs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des logs CoAP' });
  }
});

export default router;
