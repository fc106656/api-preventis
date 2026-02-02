"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const prisma_1 = __importDefault(require("./lib/prisma"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
async function initializeDatabase() {
    try {
        console.log('🔍 Checking database connection...');
        // Test de connexion
        await prisma_1.default.$connect();
        console.log('✅ Database connection successful');
        // Vérifier si les tables existent
        // On essaie d'abord de récupérer le nom de la base depuis DATABASE_URL
        let databaseName = 'preventis';
        if (process.env.DATABASE_URL) {
            try {
                const dbUrl = new URL(process.env.DATABASE_URL);
                databaseName = dbUrl.pathname.replace('/', '') || 'preventis';
            }
            catch (e) {
                // Utiliser le nom par défaut
            }
        }
        // Liste de toutes les tables requises selon le schéma Prisma
        const requiredTables = [
            'users', 'api_keys', 'gateways', 'devices',
            'sensors', 'alerts', 'zones', 'alarm_state', 'event_logs'
        ];
        try {
            // Essayer de vérifier si les tables existent
            const tables = await prisma_1.default.$queryRaw `
        SHOW TABLES
      `;
            const tableNames = tables.map(t => Object.values(t)[0]);
            const missingTables = requiredTables.filter(t => !tableNames.includes(t));
            if (missingTables.length > 0) {
                console.log(`⚠️  Missing tables: ${missingTables.join(', ')}`);
                console.log('📦 Creating database schema with Prisma...');
                await createSchema();
                console.log('✅ Database schema created successfully');
            }
            else {
                console.log('✅ All required tables exist');
            }
            return true;
        }
        catch (queryError) {
            // Si la requête SHOW TABLES échoue, les tables n'existent probablement pas
            if (queryError?.code === 'P2021' || queryError?.message?.includes('does not exist')) {
                console.log('⚠️  Database tables do not exist, creating schema...');
                await createSchema();
                console.log('✅ Database schema created successfully');
                return true;
            }
            throw queryError;
        }
        async function createSchema() {
            // Vérifier que Prisma est disponible
            try {
                await execAsync('npx prisma --version', { cwd: path_1.default.join(__dirname, '..') });
            }
            catch (e) {
                console.error('❌ Prisma CLI not available. Please ensure Prisma is installed.');
                throw new Error('Prisma CLI not available for database initialization');
            }
            const apiPath = path_1.default.join(__dirname, '..');
            // Générer le client Prisma d'abord
            console.log('📦 Generating Prisma client...');
            try {
                const { stdout: genStdout, stderr: genStderr } = await execAsync('npx prisma generate', {
                    cwd: apiPath,
                    env: { ...process.env },
                });
                if (genStdout)
                    console.log(genStdout);
                if (genStderr && !genStderr.includes('warn') && !genStderr.includes('Deprecation')) {
                    console.error(genStderr);
                }
            }
            catch (e) {
                console.warn('⚠️  Prisma generate failed, continuing anyway:', e);
            }
            // Exécuter prisma db push pour créer les tables
            console.log('📦 Pushing database schema...');
            const { stdout, stderr } = await execAsync('npx prisma db push --accept-data-loss --skip-generate', {
                cwd: apiPath,
                env: { ...process.env },
            });
            if (stdout)
                console.log(stdout);
            if (stderr && !stderr.includes('warn') && !stderr.includes('Deprecation')) {
                console.error(stderr);
            }
        }
    }
    catch (error) {
        console.error('❌ Database initialization failed:', error);
        console.error('Error details:', {
            message: error?.message,
            code: error?.code,
        });
        // Ne pas bloquer le démarrage si c'est juste une erreur de connexion
        // (la connexion sera testée à nouveau lors des requêtes)
        if (error?.code === 'P1001' || error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
            console.warn('⚠️  Database not available, but API will start anyway');
            return false;
        }
        // Pour les autres erreurs, on continue quand même (l'API peut démarrer)
        console.warn('⚠️  Continuing API startup despite database initialization error');
        return false;
    }
}
exports.default = initializeDatabase;
//# sourceMappingURL=db-init.js.map