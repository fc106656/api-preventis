// Routes d'authentification
import { Router, Request, Response } from 'express';
import { hashPassword, verifyPassword, generateToken, generateApiKey, hashApiKey } from '../lib/auth';
import prisma from '../lib/prisma';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/register - Inscription
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    // Créer l'utilisateur
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        name: name || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    // Générer une clé API par défaut
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    await prisma.apiKey.create({
      data: {
        key: apiKey,
        keyHash: apiKeyHash,
        name: 'Clé API par défaut',
        userId: user.id,
      },
    });

    // Créer une gateway par défaut
    await prisma.gateway.create({
      data: {
        name: 'Centrale principale',
        userId: user.id,
      },
    });

    // Générer un token JWT
    const token = generateToken(user.id, user.email);

    res.status(201).json({
      user,
      token,
      apiKey, // Afficher la clé API une seule fois
      message: 'Compte créé avec succès. Notez votre clé API, elle ne sera plus affichée.',
    });
  } catch (error: any) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

// POST /api/auth/login - Connexion
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // Trouver l'utilisateur
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    // Vérifier le mot de passe
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    // Générer un token JWT
    const token = generateToken(user.id, user.email);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

// GET /api/auth/me - Récupérer l'utilisateur connecté
router.get('/me', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({ user });
  } catch (error: any) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// GET /api/auth/api-keys - Liste des clés API
router.get('/api-keys', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const apiKeys = await prisma.apiKey.findMany({
      where: { userId: req.userId! },
      select: {
        id: true,
        name: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        // Ne pas exposer la clé en clair
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ apiKeys });
  } catch (error: any) {
    console.error('Get API keys error:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// POST /api/auth/api-keys - Créer une nouvelle clé API
router.post('/api-keys', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;

    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    const created = await prisma.apiKey.create({
      data: {
        key: apiKey,
        keyHash: apiKeyHash,
        name: name || 'Nouvelle clé API',
        userId: req.userId!,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      apiKey: {
        ...created,
        key: apiKey, // Afficher la clé une seule fois
      },
      message: 'Clé API créée. Notez-la, elle ne sera plus affichée.',
    });
  } catch (error: any) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

// DELETE /api/auth/api-keys/:id - Supprimer une clé API
router.delete('/api-keys/:id', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    // Vérifier que la clé appartient à l'utilisateur
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'Clé API non trouvée' });
    }

    await prisma.apiKey.delete({
      where: { id },
    });

    res.json({ message: 'Clé API supprimée' });
  } catch (error: any) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Erreur' });
  }
});

export default router;
