import { PrismaClient } from '@prisma/client';

// Singleton Prisma Client pour éviter les connexions multiples en dev
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

// Log de la configuration (sans exposer le mot de passe)
if (process.env.DATABASE_URL) {
  const dbUrl = new URL(process.env.DATABASE_URL);
  console.log('📊 Database config:', {
    host: dbUrl.hostname,
    port: dbUrl.port,
    database: dbUrl.pathname.replace('/', ''),
    user: dbUrl.username,
  });
} else {
  console.error('❌ DATABASE_URL is not set!');
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
