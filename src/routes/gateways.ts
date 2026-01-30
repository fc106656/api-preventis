// Routes pour les Gateways (Centrales)
import { Router } from 'express';
import { GatewayStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticateJWT, authenticateApiKey, AuthRequest } from '../middleware/auth';

const router = Router();

// Helper pour convertir req.params.id en string
function getParamId(id: string | string[] | undefined): string {
  if (Array.isArray(id)) return id[0];
  if (typeof id === 'string') return id;
  throw new Error('Invalid id parameter');
}

// GET /api/gateways - Liste des gateways de l'utilisateur
router.get('/', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const gateways = await prisma.gateway.findMany({
      where: { userId: req.userId! },
      include: {
        devices: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(gateways);
  } catch (error: any) {
    console.error('Error fetching gateways:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des gateways' });
  }
});

// GET /api/gateways/:id - Détail d'une gateway
router.get('/:id', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const id = getParamId(req.params.id);
    const gateway = await prisma.gateway.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
      include: {
        devices: true,
      },
    });

    if (!gateway) {
      return res.status(404).json({ error: 'Gateway non trouvée' });
    }

    res.json(gateway);
  } catch (error: any) {
    console.error('Error fetching gateway:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// POST /api/gateways - Créer une gateway
router.post('/', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const { name, apiKeyId } = req.body;

    const gateway = await prisma.gateway.create({
      data: {
        name: name || 'Nouvelle centrale',
        userId: req.userId!,
        apiKeyId: apiKeyId || null,
      },
      include: {
        devices: true,
      },
    });

    res.status(201).json(gateway);
  } catch (error: any) {
    console.error('Error creating gateway:', error);
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
});

// PUT /api/gateways/:id - Mettre à jour une gateway
router.put('/:id', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const id = getParamId(req.params.id);
    const { name, apiKeyId, config } = req.body;

    // Vérifier que la gateway appartient à l'utilisateur
    const existing = await prisma.gateway.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Gateway non trouvée' });
    }

    const gateway = await prisma.gateway.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(apiKeyId !== undefined && { apiKeyId: apiKeyId || null }),
        ...(config && { config: typeof config === 'string' ? config : JSON.stringify(config) }),
      },
      include: {
        devices: true,
      },
    });

    res.json(gateway);
  } catch (error: any) {
    console.error('Error updating gateway:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// PUT /api/gateways/:id/config - Mettre à jour la configuration
router.put('/:id/config', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const id = getParamId(req.params.id);
    const { ip, port, apiKey, deviceIds } = req.body;

    // Vérifier que la gateway appartient à l'utilisateur
    const existing = await prisma.gateway.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Gateway non trouvée' });
    }

    const config = {
      ip: ip || null,
      port: port || null,
      apiKey: apiKey || null,
      deviceIds: deviceIds || [],
    };

    const gateway = await prisma.gateway.update({
      where: { id },
      data: {
        config: JSON.stringify(config),
      },
    });

    res.json({
      ...gateway,
      config: JSON.parse(gateway.config || '{}'),
    });
  } catch (error: any) {
    console.error('Error updating gateway config:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// PUT /api/gateways/:id/heartbeat - Heartbeat depuis la gateway (authentification par API Key)
router.put('/:id/heartbeat', authenticateApiKey, async (req: AuthRequest, res) => {
  try {
    const id = getParamId(req.params.id);
    const gateway = await prisma.gateway.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!gateway) {
      return res.status(404).json({ error: 'Gateway non trouvée' });
    }

    const updated = await prisma.gateway.update({
      where: { id },
      data: {
        status: GatewayStatus.ONLINE,
        lastSeenAt: new Date(),
      },
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating gateway heartbeat:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// DELETE /api/gateways/:id - Supprimer une gateway
router.delete('/:id', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const id = getParamId(req.params.id);
    // Vérifier que la gateway appartient à l'utilisateur
    const existing = await prisma.gateway.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Gateway non trouvée' });
    }

    await prisma.gateway.delete({
      where: { id },
    });

    res.json({ message: 'Gateway supprimée' });
  } catch (error: any) {
    console.error('Error deleting gateway:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

export default router;
