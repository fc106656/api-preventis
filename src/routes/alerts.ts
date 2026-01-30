import { Router } from 'express';
import { AlertType, AlertLevel } from '@prisma/client';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/alerts - Récupérer toutes les alertes
router.get('/', async (req, res) => {
  try {
    const type = req.query.type as AlertType | undefined;
    const level = req.query.level as AlertLevel | undefined;
    const acknowledged = req.query.acknowledged as string | undefined;
    const limit = req.query.limit as string | undefined;

    const alerts = await prisma.alert.findMany({
      where: {
        ...(type && { type }),
        ...(level && { level }),
        ...(acknowledged !== undefined && { acknowledged: acknowledged === 'true' }),
      },
      include: { sensor: true },
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit) : undefined,
    });

    res.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des alertes' });
  }
});

// GET /api/alerts/active - Alertes non acquittées
router.get('/active', async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { acknowledged: false },
      include: { sensor: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(alerts);
  } catch (error) {
    console.error('Error fetching active alerts:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// GET /api/alerts/:id
router.get('/:id', async (req, res) => {
  try {
    const alert = await prisma.alert.findUnique({
      where: { id: req.params.id },
      include: { sensor: true },
    });

    if (!alert) {
      return res.status(404).json({ error: 'Alerte non trouvée' });
    }

    res.json(alert);
  } catch (error) {
    console.error('Error fetching alert:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// POST /api/alerts - Créer une alerte
router.post('/', async (req, res) => {
  try {
    const { type, level, title, message, location, sensorId } = req.body;

    const alert = await prisma.alert.create({
      data: {
        type: type as AlertType,
        level: level as AlertLevel,
        title,
        message,
        location,
        sensorId: sensorId || null,
      },
    });

    res.status(201).json(alert);
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// PUT /api/alerts/:id/acknowledge - Acquitter
router.put('/:id/acknowledge', async (req, res) => {
  try {
    const alert = await prisma.alert.update({
      where: { id: req.params.id },
      data: { acknowledged: true },
    });

    res.json(alert);
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// PUT /api/alerts/acknowledge-all
router.put('/acknowledge-all', async (req, res) => {
  try {
    const result = await prisma.alert.updateMany({
      where: { acknowledged: false },
      data: { acknowledged: true },
    });

    res.json({ message: `${result.count} alertes acquittées` });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// DELETE /api/alerts/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.alert.delete({ where: { id: req.params.id } });
    res.json({ message: 'Alerte supprimée' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

export default router;
