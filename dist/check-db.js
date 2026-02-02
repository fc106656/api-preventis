"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Script pour vérifier la connexion à la base de données
const prisma_1 = __importDefault(require("./lib/prisma"));
async function checkDatabase() {
    try {
        console.log('🔍 Checking database connection...');
        console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ NOT SET');
        // Test de connexion
        await prisma_1.default.$connect();
        console.log('✅ Database connection successful');
        // Test de requête simple
        await prisma_1.default.$queryRaw `SELECT 1`;
        console.log('✅ Database query successful');
        // Vérifier si les tables existent
        const tables = await prisma_1.default.$queryRaw `
      SHOW TABLES
    `;
        console.log(`✅ Found ${tables.length} tables:`, tables.map(t => t.Tables_in_preventis));
        await prisma_1.default.$disconnect();
        return true;
    }
    catch (error) {
        console.error('❌ Database check failed:', error);
        console.error('Error details:', {
            message: error?.message,
            code: error?.code,
            meta: error?.meta,
        });
        await prisma_1.default.$disconnect();
        return false;
    }
}
// Exécuter si appelé directement
if (require.main === module) {
    checkDatabase()
        .then((success) => {
        process.exit(success ? 0 : 1);
    });
}
exports.default = checkDatabase;
//# sourceMappingURL=check-db.js.map