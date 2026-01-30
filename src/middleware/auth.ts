// Middleware d'authentification
import { Request, Response, NextFunction } from 'express';
import { verifyToken, verifyApiKey } from '../lib/auth';
import prisma from '../lib/prisma';

// Interface pour Request avec user
export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

// Middleware pour authentification JWT (app)
export async function authenticateJWT(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }

    // Récupérer l'utilisateur
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    req.userId = user.id;
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Erreur d\'authentification' });
  }
}

// Middleware pour authentification par clé API (devices)
export async function authenticateApiKey(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const apiKey = req.headers['x-api-key'] as string || 
                   req.headers['authorization']?.replace('Bearer ', '') ||
                   req.query.apiKey as string;

    if (!apiKey) {
      return res.status(401).json({ error: 'Clé API manquante' });
    }

    const verified = await verifyApiKey(apiKey);

    if (!verified) {
      return res.status(401).json({ error: 'Clé API invalide ou expirée' });
    }

    req.userId = verified.userId;
    next();
  } catch (error) {
    console.error('API Key auth error:', error);
    res.status(401).json({ error: 'Erreur d\'authentification' });
  }
}

// Middleware optionnel (JWT ou API Key)
export async function authenticateOptional(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Essayer JWT d'abord
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      if (decoded) {
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, email: true, name: true },
        });
        if (user) {
          req.userId = user.id;
          req.user = user;
          return next();
        }
      }
    }

    // Sinon essayer API Key
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      const verified = await verifyApiKey(apiKey);
      if (verified) {
        req.userId = verified.userId;
        return next();
      }
    }

    // Pas d'authentification, continuer quand même
    next();
  } catch (error) {
    // En cas d'erreur, continuer sans auth
    next();
  }
}
