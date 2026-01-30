// Routes pour les Devices (Modules/Capteurs)
import { Router } from 'express';
import { DeviceType, DeviceStatus, AlertType, AlertLevel } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticateJWT, authenticateApiKey, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/devices - Liste des devices de l'utilisateur
router.get('/', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const { type, gatewayId, status } = req.query;

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

    res.json(devices);
  } catch (error: any) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des devices' });
  }
});

// GET /api/devices/:id - Détail d'un device
router.get('/:id', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const device = await prisma.device.findFirst({
      where: {
        id: req.params.id,
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

    res.json(device);
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
    const { name, type, location, status, threshold, unit, gatewayId, metadata } = req.body;

    // Vérifier que le device appartient à l'utilisateur
    const existing = await prisma.device.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Device non trouvé' });
    }

    const device = await prisma.device.update({
      where: { id: req.params.id },
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
    const id = req.params.id;

    const existingDevice = await prisma.device.findFirst({
      where: {
        id,
        userId: req.userId!, // Vérifier que le device appartient à l'utilisateur de la clé API
      },
    });

    if (!existingDevice) {
      return res.status(404).json({ error: 'Device non trouvé' });
    }

    // Déterminer le statut basé sur la valeur
    let newStatus: DeviceStatus = DeviceStatus.ONLINE;
    const numValue = parseFloat(value);
    if (numValue >= existingDevice.threshold) {
      newStatus = DeviceStatus.ALERT;
    } else if (numValue >= existingDevice.threshold * 0.8) {
      newStatus = DeviceStatus.WARNING;
    }

    const device = await prisma.device.update({
      where: { id },
      data: {
        value: numValue,
        status: newStatus,
        ...(batteryLevel !== undefined && { batteryLevel: parseInt(batteryLevel) }),
      },
    });

    // Créer une alerte si seuil dépassé
    if (newStatus === DeviceStatus.ALERT && existingDevice.status !== DeviceStatus.ALERT) {
      let alertType: AlertType = AlertType.SYSTEM;
      if (existingDevice.type === DeviceType.SENSOR_INFRARED) {
        alertType = AlertType.INTRUSION;
      } else if ([DeviceType.SENSOR_CO2, DeviceType.SENSOR_SMOKE, DeviceType.SENSOR_TEMPERATURE].includes(existingDevice.type)) {
        alertType = AlertType.FIRE;
      }

      await prisma.alert.create({
        data: {
          type: alertType,
          level: AlertLevel.CRITICAL,
          title: `Alerte ${existingDevice.type} - ${existingDevice.name}`,
          message: `Seuil dépassé: ${numValue} ${existingDevice.unit}`,
          location: existingDevice.location,
          deviceId: id,
          userId: req.userId!,
        },
      });
    }

    res.json(device);
  } catch (error: any) {
    console.error('Error updating device value:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// DELETE /api/devices/:id - Supprimer un device
router.delete('/:id', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    // Vérifier que le device appartient à l'utilisateur
    const existing = await prisma.device.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Device non trouvé' });
    }

    await prisma.device.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Device supprimé' });
  } catch (error: any) {
    console.error('Error deleting device:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

export default router;
