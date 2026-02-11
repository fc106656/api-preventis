import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/logs - Récupérer les logs
router.get('/', async (req, res) => {
  try {
    const type = req.query.type as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    // Construire les filtres
    const where: any = {};
    
    if (type) {
      where.type = type;
    }
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Récupérer les logs avec pagination
    const [logs, total] = await Promise.all([
      prisma.eventLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.eventLog.count({ where }),
    ]);

    // Compter les logs par type
    const logsByType = await prisma.eventLog.groupBy({
      by: ['type'],
      _count: {
        type: true,
      },
      where,
    });

    res.json({
      logs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
      stats: {
        byType: logsByType.reduce((acc, item) => {
          acc[item.type] = item._count.type;
          return acc;
        }, {} as Record<string, number>),
      },
    });
  } catch (error: any) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération des logs',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
    });
  }
});

// GET /api/logs/stats - Statistiques des logs
router.get('/stats', async (req, res) => {
  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    const [total, byType, recent] = await Promise.all([
      prisma.eventLog.count({ where }),
      prisma.eventLog.groupBy({
        by: ['type'],
        _count: { type: true },
        where,
      }),
      prisma.eventLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          type: true,
          createdAt: true,
        },
      }),
    ]);

    res.json({
      total,
      byType: byType.reduce((acc, item) => {
        acc[item.type] = item._count.type;
        return acc;
      }, {} as Record<string, number>),
      recent: recent.map(log => ({
        type: log.type,
        date: log.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching log stats:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération des statistiques',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
    });
  }
});

// DELETE /api/logs - Supprimer les logs (optionnel, pour nettoyer)
router.delete('/', async (req, res) => {
  try {
    const olderThan = req.query.olderThan as string | undefined;
    const type = req.query.type as string | undefined;

    const where: any = {};
    
    if (olderThan) {
      where.createdAt = {
        lt: new Date(olderThan),
      };
    }
    
    if (type) {
      where.type = type;
    }

    const result = await prisma.eventLog.deleteMany({ where });

    res.json({
      success: true,
      deleted: result.count,
      message: `${result.count} log(s) supprimé(s)`,
    });
  } catch (error: any) {
    console.error('Error deleting logs:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la suppression des logs',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
    });
  }
});

export default router;
