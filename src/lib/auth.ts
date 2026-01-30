// Utilitaires d'authentification
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Hash un mot de passe
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Vérifie un mot de passe
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Génère un JWT
export function generateToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );
}

// Vérifie un JWT
export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    return decoded;
  } catch (error) {
    return null;
  }
}

// Génère une clé API
export function generateApiKey(): string {
  // Format: pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `pk_live_${randomBytes}`;
}

// Hash une clé API pour stockage
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Vérifie une clé API
export async function verifyApiKey(apiKey: string): Promise<{ userId: string; apiKeyId: string } | null> {
  const keyHash = hashApiKey(apiKey);
  
  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });

  if (!apiKeyRecord) {
    return null;
  }

  // Vérifier expiration
  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    return null;
  }

  // Mettre à jour lastUsedAt
  await prisma.apiKey.update({
    where: { id: apiKeyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    userId: apiKeyRecord.userId,
    apiKeyId: apiKeyRecord.id,
  };
}
