import { Router } from 'express';
import { AlarmMode, AlertType, AlertLevel } from '@prisma/client';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/alarm
router.get('/', async (req, res) => {
  try {
    let alarmState = await prisma.alarmState.findUnique({
      where: { id: 'main' },
    });

    if (!alarmState) {
      alarmState = await prisma.alarmState.create({
        data: { id: 'main', isArmed: false, mode: AlarmMode.OFF, sirenActive: false },
      });
    }

    res.json(alarmState);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// PUT /api/alarm/mode
router.put('/mode', async (req, res) => {
  try {
    const { mode } = req.body;

    const validModes = ['OFF', 'HOME', 'AWAY', 'NIGHT'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ error: 'Mode invalide' });
    }

    const alarmState = await prisma.alarmState.upsert({
      where: { id: 'main' },
      update: {
        mode: mode as AlarmMode,
        isArmed: mode !== 'OFF',
        lastArmedAt: mode !== 'OFF' ? new Date() : undefined,
      },
      create: {
        id: 'main',
        mode: mode as AlarmMode,
        isArmed: mode !== 'OFF',
        lastArmedAt: mode !== 'OFF' ? new Date() : undefined,
      },
    });

    res.json(alarmState);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// PUT /api/alarm/siren
router.put('/siren', async (req, res) => {
  try {
    const { active } = req.body;

    const alarmState = await prisma.alarmState.upsert({
      where: { id: 'main' },
      update: { sirenActive: active },
      create: { id: 'main', sirenActive: active },
    });

    res.json(alarmState);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// POST /api/alarm/trigger
router.post('/trigger', async (req, res) => {
  try {
    const { reason, sensorId } = req.body;

    const currentState = await prisma.alarmState.findUnique({
      where: { id: 'main' },
    });

    if (!currentState?.isArmed) {
      return res.status(400).json({ error: 'Alarme non armée' });
    }

    const alarmState = await prisma.alarmState.update({
      where: { id: 'main' },
      data: { sirenActive: true },
    });

    await prisma.alert.create({
      data: {
        type: AlertType.INTRUSION,
        level: AlertLevel.CRITICAL,
        title: 'Alarme déclenchée',
        message: reason || 'Intrusion détectée',
        location: 'Système',
        sensorId: sensorId || null,
      },
    });

    res.json({ message: 'Alarme déclenchée', alarmState });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// POST /api/alarm/reset
router.post('/reset', async (req, res) => {
  try {
    const alarmState = await prisma.alarmState.update({
      where: { id: 'main' },
      data: { sirenActive: false },
    });

    res.json(alarmState);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

export default router;
