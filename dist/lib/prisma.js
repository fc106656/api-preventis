"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
// Singleton Prisma Client pour éviter les connexions multiples en dev
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ??
    new client_1.PrismaClient({
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
}
else {
    console.error('❌ DATABASE_URL is not set!');
}
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = exports.prisma;
}
exports.default = exports.prisma;
//# sourceMappingURL=prisma.js.map