// Routes pour les Devices (Modules/Capteurs)
import { Router } from 'express';
import { DeviceType, DeviceStatus, AlertType, AlertLevel } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticateJWT, authenticateApiKey, AuthRequest } from '../middleware/auth';
import { updateDeviceValue } from '../lib/deviceService';

const router = Router();

// Helper pour convertir req.params.id en string
function getParamId(id: string | string[] | undefined): string {
  if (Array.isArray(id)) return id[0];
  if (typeof id === 'string') return id;
  throw new Error('Invalid id parameter');
}

// Seuil de timeout pour considérer un device comme OFFLINE (1 minute)
// Pour un système IoT en temps réel, on veut détecter rapidement les déconnexions
const DEVICE_TIMEOUT_MS = 1 * 60 * 1000; // 1 minute en millisecondes

/**
 * Vérifie si un device doit être considéré comme OFFLINE
 * et met à jour son statut si nécessaire
 */
async function checkAndUpdateDeviceStatus(device: any): Promise<any> {
  const now = new Date();
  const updatedAt = new Date(device.updatedAt);
  const timeSinceUpdate = now.getTime() - updatedAt.getTime();

  // Si le device n'a pas été mis à jour depuis plus de 1 minute
  // et qu'il n'est pas déjà en ALERT ou WARNING, le mettre en OFFLINE
  if (timeSinceUpdate > DEVICE_TIMEOUT_MS && device.status !== DeviceStatus.ALERT && device.status !== DeviceStatus.WARNING) {
    // Mettre à jour le statut en base de données
    const updated = await prisma.device.update({
      where: { id: device.id },
      data: { status: DeviceStatus.OFFLINE },
    });
    return { ...device, status: DeviceStatus.OFFLINE };
  }

  return device;
}

// GET /api/devices - Liste des devices de l'utilisateur
router.get('/', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const type = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type;
    const gatewayId = Array.isArray(req.query.gatewayId) ? req.query.gatewayId[0] : req.query.gatewayId;
    const status = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;

    const devices = await prisma.device.findMany({
      where: {
        userId: req.userId!,
        ...(type && { type: type as DeviceType }),
        ...(gatewayId && { gatewayId: gatewayId as string }),
        ...(status && { status: status as DeviceStatus }),
      },
      include: {
        gateway: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Vérifier et mettre à jour le statut de chaque device
    const devicesWithUpdatedStatus = await Promise.all(
      devices.map(device => checkAndUpdateDeviceStatus(device))
    );

    res.json(devicesWithUpdatedStatus);
  } catch (error: any) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des devices' });
  }
});

// GET /api/devices/:id - Détail d'un device
router.get('/:id', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const id = getParamId(req.params.id);
    const device = await prisma.device.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
      include: {
        gateway: true,
        alerts: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!device) {
      return res.status(404).json({ error: 'Device non trouvé' });
    }

    // Vérifier et mettre à jour le statut si nécessaire
    const deviceWithUpdatedStatus = await checkAndUpdateDeviceStatus(device);

    res.json(deviceWithUpdatedStatus);
  } catch (error: any) {
    console.error('Error fetching device:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// POST /api/devices - Créer un device
router.post('/', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const { name, type, location, threshold, unit, gatewayId, metadata } = req.body;

    if (!name || !type || !location || threshold === undefined) {
      return res.status(400).json({ error: 'Champs requis: name, type, location, threshold' });
    }

    const device = await prisma.device.create({
      data: {
        name,
        type: type as DeviceType,
        location,
        threshold: parseFloat(threshold),
        unit: unit || '',
        userId: req.userId!,
        gatewayId: gatewayId || null,
        metadata: metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null,
      },
      include: {
        gateway: true,
      },
    });

    res.status(201).json(device);
  } catch (error: any) {
    console.error('Error creating device:', error);
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
});

// PUT /api/devices/:id - Mettre à jour un device
router.put('/:id', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const id = getParamId(req.params.id);
    const { name, type, location, status, threshold, unit, gatewayId, metadata } = req.body;

    // Vérifier que le device appartient à l'utilisateur
    const existing = await prisma.device.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Device non trouvé' });
    }

    const device = await prisma.device.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(type && { type: type as DeviceType }),
        ...(location && { location }),
        ...(status && { status: status as DeviceStatus }),
        ...(threshold !== undefined && { threshold: parseFloat(threshold) }),
        ...(unit !== undefined && { unit }),
        ...(gatewayId !== undefined && { gatewayId: gatewayId || null }),
        ...(metadata && { metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata) }),
      },
      include: {
        gateway: true,
      },
    });

    res.json(device);
  } catch (error: any) {
    console.error('Error updating device:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// PUT /api/devices/:id/value - Mettre à jour la valeur d'un device (authentification par API Key)
router.put('/:id/value', authenticateApiKey, async (req: AuthRequest, res) => {
  try {
    const { value, batteryLevel } = req.body;
    const id = getParamId(req.params.id);

    if (!req.userId) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const result = await updateDeviceValue({
      deviceId: id,
      userId: req.userId,
      value: parseFloat(value),
      batteryLevel: batteryLevel !== undefined ? parseInt(String(batteryLevel)) : undefined,
    });

    if (!result.success) {
      return res.status(result.error === 'Device non trouvé' ? 404 : 500).json({
        error: result.error || 'Erreur lors de la mise à jour',
      });
    }

    res.json(result.device);
  } catch (error: any) {
    console.error('Error updating device value:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// GET /api/devices/:id/history - Historique des valeurs d'un device
router.get('/:id/history', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const id = getParamId(req.params.id);
    const period = Array.isArray(req.query.period) ? req.query.period[0] : req.query.period || '1h';
    
    // Vérifier que le device appartient à l'utilisateur
    const device = await prisma.device.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!device) {
      return res.status(404).json({ error: 'Device non trouvé' });
    }

    // Calculer la date de début selon la période
    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case '15m':
        startDate = new Date(now.getTime() - 15 * 60 * 1000);
        break;
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        startDate = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 60 * 60 * 1000); // 1h par défaut
    }

    // Récupérer l'historique
    const history = await prisma.deviceValueHistory.findMany({
      where: {
        deviceId: id,
        createdAt: {
          gte: startDate,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        value: true,
        batteryLevel: true,
        status: true,
        createdAt: true,
      },
    });

    res.json(history);
  } catch (error: any) {
    console.error('Error fetching device history:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique' });
  }
});

// DELETE /api/devices/:id - Supprimer un device
router.delete('/:id', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const id = getParamId(req.params.id);
    // Vérifier que le device appartient à l'utilisateur
    const existing = await prisma.device.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Device non trouvé' });
    }

    await prisma.device.delete({
      where: { id },
    });

    res.json({ message: 'Device supprimé' });
  } catch (error: any) {
    console.error('Error deleting device:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

export default router;
